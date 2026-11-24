import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {createChatGPT} = createRequire(import.meta.url)('../electron/chatgpt.cjs');

test('restores a saved subscription session, refreshes once, and uses the account model catalog', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'daru-chatgpt-'));
  const credentialFile = join(directory, 'chatgpt-session.enc');
  const mockStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from('test:' + value),
    decryptString: (value: Buffer) => value.toString().slice(5),
  };
  const previous = {client:'oaiapp_fixture',subject:'test-user',email:'test@example.invalid',token:'old',refresh:'refresh',expires:0};
  const calls: string[] = [];
  const request = async (target: string | URL, options: RequestInit) => {
    const url=String(target);
    calls.push(url);
    if (url.endsWith('/token')) {
      assert.equal((options.body as URLSearchParams).get('grant_type'), 'refresh_token');
      assert.equal((options.body as URLSearchParams).get('client_id'), previous.client);
      return Response.json({access_token:'new',refresh_token:'rotated',expires_in:3600,token_type:'Bearer'});
    }
    if (url.endsWith('/openid-configuration')) return Response.json({revocation_endpoint:'https://auth.openai.com/revoke'});
    if (url.endsWith('/revoke')) return new Response(null, {status:200});
    assert.equal(new Headers(options.headers).get('authorization'), 'Bearer new');
    if (url.endsWith('/models')) {
      return Response.json({models:[{slug:'gpt-visible',display_name:'Visible',visibility:'list'},{slug:'gpt-hidden',display_name:'Hidden',visibility:'hidden'}]});
    }
    assert.equal(JSON.parse(options.body as string).model,'gpt-visible');
    return new Response('data: {"type":"response.output_text.delta","delta":"응답"}\n\ndata: {"type":"response.completed"}\n\n');
  };
  try {
    await writeFile(credentialFile, mockStorage.encryptString(JSON.stringify(previous)));
    const model=createChatGPT({getPath:()=>directory}, {}, mockStorage, request);
    assert.deepEqual(await model.status(),{connected:true,pending:false,account:previous.email,persistent:true});
    const [catalog]=await Promise.all([model.listModels(),model.listModels()]);
    assert.deepEqual(catalog,[{id:'gpt-visible',name:'Visible'}]);
    assert.equal(calls.filter(url=>url.endsWith('/token')).length,1);
    assert.equal(JSON.parse(mockStorage.decryptString(await readFile(credentialFile))).refresh,'rotated');
    const history=[{role:'user',content:'테스트'}];
    await assert.rejects(model.ask(history,'gpt-hidden'),/모델/);
    assert.equal(await model.ask(history,'gpt-visible'),'응답');
    assert.equal((await model.signOut()).remoteRevoked,true);
    assert.deepEqual(JSON.parse(mockStorage.decryptString(await readFile(credentialFile))),{client:previous.client,subject:previous.subject,email:previous.email});
    assert.equal((await model.status()).connected,false);
  } finally {await rm(directory,{recursive:true,force:true});}
});
