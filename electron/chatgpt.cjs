const http = require('node:http');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { promises: fs } = require('node:fs');
const path = require('node:path');

const issuer = 'https://auth.openai.com';
const resource = 'https://api.openai.com/v1';
const scope = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const random = () => randomBytes(32).toString('base64url');

function createChatGPT(app, shell) {
  let session;
  let pending = false;
  const status = () => ({ connected: !!session && session.expires > Date.now(), pending });
  async function signIn() {
    if (pending) throw Error('이미 로그인 중이에요.');
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
        client_id: 'dynamic_agent_client', agent_name_hint: 'Daru', ext_agent_host_id: host.trim(),
        response_type: 'code', redirect_uri: redirect, scope, resource, state, nonce,
        code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      });
      timer = setTimeout(() => reject(Error('로그인 시간이 지났어요.')), 180000);
      await shell.openExternal(issuer + '/api/accounts/authorize?' + query);
      const result = await callback;
      server.close();
      const client = result.get('client_id'), code = result.get('code');
      if (!client || !/^oaiapp_[a-zA-Z0-9_-]+$/.test(client) || !code) throw Error('ChatGPT 앱 등록을 완료하지 못했어요.');
      const response = await fetch(issuer + '/api/accounts/oauth/token', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: client, code, code_verifier: verifier, redirect_uri: redirect, resource }),
      });
      if (!response.ok) throw Error('ChatGPT 로그인 확인에 실패했어요 (' + response.status + ').');
      const token = await response.json();
      const { jwtVerify, createRemoteJWKSet } = await import('jose');
      const keys = createRemoteJWKSet(new URL(issuer + '/.well-known/jwks.json'));
      const { payload } = await jwtVerify(token.id_token, keys, { issuer, audience: client, requiredClaims: ['sub', 'exp', 'nonce'] });
      if (payload.nonce !== nonce || !String(token.scope).split(/\s+/).includes('chatgpt.tokens.use.direct')
          || typeof token.access_token !== 'string' || !(token.expires_in > 0)) throw Error('ChatGPT 구독 사용 권한을 확인하지 못했어요.');
      session = { token: token.access_token, expires: Date.now() + token.expires_in * 1000 };
      return status();
    } finally {
      clearTimeout(timer);
      server?.close();
      pending = false;
    }
  }
  async function ask(history, model) {
    if (!status().connected) throw Error('설정에서 ChatGPT에 다시 로그인해 주세요.');
    if (typeof model !== 'string' || !/^gpt-[a-zA-Z0-9.-]{1,60}$/.test(model)
      || !Array.isArray(history) || history.length<1 || history.length>9 || history.some(entry =>
        !['user','assistant'].includes(entry?.role) || typeof entry.content !== 'string' || entry.content.length>4000)) throw Error('모델 또는 메시지를 확인해 주세요.');
    const response = await fetch(resource + '/responses', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json' },
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
  return { status, signIn, ask, signOut: () => { session = undefined; return status(); } };
}
module.exports = { createChatGPT };
