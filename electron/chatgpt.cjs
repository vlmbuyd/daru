const http = require('node:http');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { promises: fs } = require('node:fs');
const path = require('node:path');

const issuer = 'https://auth.openai.com';
const resource = 'https://api.openai.com/v1';
const scope = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const planScope = 'chatgpt.tokens.use.direct';
const tokenEndpoint = issuer + '/api/accounts/oauth/token';
const random = () => randomBytes(32).toString('base64url');

function createChatGPT(app, shell, safeStorage, request = fetch) {
  const credentialsPath = path.join(app.getPath('userData'), 'chatgpt-session.enc');
  let session;
  let pending = false;
  let renewal;
  let catalog = [];
  const storageAvailable = () => safeStorage?.isEncryptionAvailable() === true
    && safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
  const initialized = (async () => {
    if (!storageAvailable()) return;
    try {
      const bytes = await fs.readFile(credentialsPath);
      const saved = JSON.parse(safeStorage.decryptString(bytes));
      if (validClient(saved.client) && typeof saved.subject === 'string') session = saved;
    } catch {}
  })();
  const validClient = client => typeof client === 'string' && /^oaiapp_[a-zA-Z0-9_-]+$/.test(client);
  async function status() {
    await initialized;
    return {
      connected: !!session?.token && (session.expires > Date.now() || !!session.refresh),
      pending,
      account: session?.email,
      persistent: storageAvailable(),
    };
  }
  async function save(next) {
    if (storageAvailable()) {
      await fs.mkdir(path.dirname(credentialsPath), { recursive: true });
      const temporary = credentialsPath + '.' + randomUUID();
      try {
        await fs.writeFile(temporary, safeStorage.encryptString(JSON.stringify(next)), { mode: 0o600 });
        await fs.rename(temporary, credentialsPath);
      } finally { await fs.rm(temporary, { force: true }); }
    }
    session = next;
  }
  function tokenRequest(fields) {
    return request(tokenEndpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      body: new URLSearchParams({ ...fields, resource }),
    });
  }
  function tokenFields(token, previous) {
    if (typeof token.access_token !== 'string' || !token.access_token || !Number.isFinite(token.expires_in)
        || token.expires_in <= 0 || String(token.token_type).toLowerCase() !== 'bearer'
        || (token.scope != null && !String(token.scope).split(/\s+/).includes(planScope))) {
      throw Error('ChatGPT 구독 사용 권한을 확인하지 못했어요.');
    }
    return {
      ...previous, token: token.access_token, expires: Date.now() + token.expires_in * 1000,
      refresh: typeof token.refresh_token === 'string' ? token.refresh_token : previous.refresh,
    };
  }
  async function accessToken() {
    await initialized;
    if (pending) throw Error('계정 연결이 끝난 뒤 다시 시도해 주세요.');
    if (session?.token && session.expires > Date.now() + 60000) return session.token;
    if (!session?.refresh) {
      if (session?.token && session.expires > Date.now()) return session.token;
      throw Error('설정에서 ChatGPT에 다시 로그인해 주세요.');
    }
    if (!renewal) {
      const previous = session;
      renewal = (async () => {
        const response = await tokenRequest({ grant_type: 'refresh_token', client_id: previous.client, refresh_token: previous.refresh });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (data.error === 'invalid_grant') {
            await save(registration(previous));
            catalog = [];
            throw Error('연결이 만료됐어요. 설정에서 다시 로그인해 주세요.');
          }
          throw Error('ChatGPT 연결을 갱신하지 못했어요. 잠시 후 다시 시도해 주세요.');
        }
        const next = tokenFields(data, previous);
        await save(next);
        return next.token;
      })().finally(() => { renewal = undefined; });
    }
    return renewal;
  }
  function registration(value) {
    return { client: value.client, subject: value.subject, email: value.email };
  }
  async function signIn() {
    await initialized;
    if (pending || renewal) throw Error('이미 계정 연결을 처리 중이에요.');
    pending = true;
    let server;
    let timer;
    try {
      const hostFile = path.join(app.getPath('userData'), 'chatgpt-host');
      let host;
      try { host = await fs.readFile(hostFile, 'utf8'); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        host = 'urn:uuid:' + randomUUID();
        await fs.mkdir(path.dirname(hostFile), { recursive: true });
        await fs.writeFile(hostFile, host, { mode: 0o600, flag: 'wx' });
      }
      const previous = session;
      const state = random(), nonce = random(), verifier = random();
      let accept, reject;
      const callback = new Promise((resolve, fail) => { accept = resolve; reject = fail; });
      void callback.catch(() => {});
      server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (req.method !== 'GET' || url.pathname !== '/auth/callback' || url.searchParams.get('state') !== state) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('다루로 돌아가 로그인 결과를 확인하세요.');
        if (url.searchParams.has('error')) reject(Error('ChatGPT 사용 권한이 승인되지 않았어요.'));
        else accept(url.searchParams);
      });
      await new Promise((resolve, fail) => {
        server.once('error', fail);
        server.listen(0, '127.0.0.1', resolve);
      });
      const redirect = 'http://127.0.0.1:' + server.address().port + '/auth/callback';
      const query = new URLSearchParams({
        client_id: previous?.client ?? 'dynamic_agent_client', ext_agent_host_id: host.trim(),
        response_type: 'code', redirect_uri: redirect, scope, resource, state, nonce,
        code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      });
      if (!previous) query.set('agent_name_hint', 'Daru');
      timer = setTimeout(() => reject(Error('로그인 시간이 지났어요.')), 180000);
      await shell.openExternal(issuer + '/api/accounts/authorize?' + query);
      const result = await callback;
      server.close();
      const client = result.get('client_id') ?? previous?.client;
      const code = result.get('code');
      if (!validClient(client) || !code || (previous && client !== previous.client)) {
        throw Error('ChatGPT 앱 등록을 완료하지 못했어요.');
      }
      const response = await tokenRequest({ grant_type: 'authorization_code', client_id: client,
        code, code_verifier: verifier, redirect_uri: redirect });
      if (!response.ok) throw Error('ChatGPT 로그인 확인에 실패했어요 (' + response.status + ').');
      const token = await response.json();
      const { jwtVerify, createRemoteJWKSet } = await import('jose');
      const keys = createRemoteJWKSet(new URL(issuer + '/.well-known/jwks.json'));
      const { payload } = await jwtVerify(token.id_token, keys, { issuer, audience: client, requiredClaims: ['sub', 'exp', 'nonce'] });
      if (payload.nonce !== nonce || !String(token.scope).split(/\s+/).includes(planScope)
          || (previous && previous.subject !== payload.sub)) {
        throw Error('ChatGPT 계정 또는 구독 사용 권한을 확인하지 못했어요.');
      }
      await save(tokenFields(token, { client, subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined }));
      catalog = [];
    } finally {
      clearTimeout(timer);
      server?.close();
      pending = false;
    }
    return status();
  }
  async function listModels() {
    const access = await accessToken();
    const response = await request(resource + '/models', {
      headers: { Authorization: 'Bearer ' + access },
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error('ChatGPT 모델 목록을 불러오지 못했어요 (' + response.status + ').');
    const { models } = await response.json();
    if (!Array.isArray(models)) throw Error('ChatGPT 모델 목록 형식이 올바르지 않아요.');
    catalog = models.filter(model => model?.visibility === 'list' && typeof model.slug === 'string'
      && model.slug.length <= 100 && typeof model.display_name === 'string')
      .map(model => ({ id: model.slug, name: model.display_name }));
    return catalog;
  }
  async function ask(history, model) {
    if (typeof model !== 'string' || !catalog.some(entry => entry.id === model)
      || !Array.isArray(history) || history.length<1 || history.length>9 || history.some(entry =>
        !['user','assistant'].includes(entry?.role) || typeof entry.content !== 'string' || entry.content.length>4000)) throw Error('모델 또는 메시지를 확인해 주세요.');
    const access = await accessToken();
    const response = await request(resource + '/responses', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, store: false, stream: true, input: history,
        instructions: 'You are Daru, a Korean calendar assistant. You cannot access or save calendar records. When asked to create, rename, or complete a task, suggest one command for the user to review, using formats: title with date/time, 수정 existing => new, 완료 title, or 되돌리기 title. Never claim a change was saved.' }),
    });
    if (!response.ok || !response.body) throw Error('ChatGPT 요청 실패 (' + response.status + '). 모델과 구독 권한을 확인해 주세요.');
    let buffer = '', reply = '', completed = false;
    for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
      buffer += chunk;
      if (buffer.length > 262144) throw Error('응답을 읽지 못했어요.');
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0,end).trim();
        buffer = buffer.slice(end+1);
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        const event = JSON.parse(line.slice(6));
        if (event.type === 'response.output_text.delta') reply += event.delta;
        if (event.type === 'response.completed') completed = true;
        if (reply.length>4000) throw Error('응답이 길어요. 질문 범위를 줄여 주세요.');
      }
    }
    if (!completed || !reply.trim()) throw Error('ChatGPT 응답이 완료되지 않았어요.');
    return reply;
  }
  async function signOut({ forget = false } = {}) {
    await initialized;
    if (pending || renewal) throw Error('이미 계정 연결을 처리 중이에요.');
    pending = true;
    let remoteRevoked = !session?.refresh;
    try {
      const previous = session;
      if (previous?.refresh) {
        try {
          const discovery = await request(issuer + '/.well-known/openid-configuration', {
            redirect: 'error', signal: AbortSignal.timeout(5000),
          });
          if (discovery.ok) {
            const endpoint = new URL((await discovery.json()).revocation_endpoint);
            if (endpoint.origin === issuer) {
              const response = await request(endpoint, {
                method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
                body: new URLSearchParams({ token: previous.refresh, token_type_hint: 'refresh_token', client_id: previous.client }),
              });
              remoteRevoked = response.ok;
            }
          }
        } catch {}
      }
      if (forget || !previous) {
        session = undefined;
        await fs.rm(credentialsPath, { force: true });
      } else await save(registration(previous));
      catalog = [];
    } finally { pending = false; }
    return { ...await status(), remoteRevoked };
  }
  return { status, signIn, ask, listModels, signOut };
}
module.exports = { createChatGPT };
