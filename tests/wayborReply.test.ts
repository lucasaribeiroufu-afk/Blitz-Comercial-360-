import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultCommercialContact, signedCommercialReply, wayborReply, youtubeReplyTarget} from '../src/utils/wayborReply';

test('quotes for Helena acknowledge both service options and request project details',()=>{
  const draft = wayborReply({name:'@Helena-rd5yk',product:'tinta impermeabilizante para telhado',
    category:'price_question',comment:'Quanto ficaria esse serviço com material e mão de obra e também só a mão de obra?'});
  assert.match(draft,/^Olá, Helena!/);
  assert.match(draft,/material e mão de obra.*só da aplicação/);
  assert.match(draft,/cidade.*telhado.*área aproximada/);
  assert.match(signedCommercialReply(draft,defaultCommercialContact),/WhatsApp \(11\) 92505-1092.*em particular\.\nWaybor Comercial$/);
});

test('the reviewer can draft about different products without assuming price or compatibility',()=>{
  const floor = wayborReply({name:'@cliente123',product:'piso antiderrapante',category:'service_question',comment:'Vocês aplicam?'});
  assert.match(floor,/piso antiderrapante/);
  assert.match(floor,/que tipo de piso/);
  assert.match(floor,/^Olá!/);
  const generic = wayborReply({name:'Maria',product:'tela de sombreamento',category:'purchase_mention',comment:'Onde compro?'});
  assert.match(generic,/tela de sombreamento/);
  assert.match(generic,/para que uso precisa/);
});

test('direct YouTube sending requires a secure original link with the video and comment IDs',()=>{
  const target = 'https://www.youtube.com/watch?v=Mq5YdqFlXi0&lc=UgyrM2O70lBhudqRg7t4AaABAg';
  assert.deepEqual(youtubeReplyTarget(target),{videoId:'Mq5YdqFlXi0',commentId:'UgyrM2O70lBhudqRg7t4AaABAg'});
  assert.equal(youtubeReplyTarget(target.replace('www.youtube.com','www.youtube.com.example.com')),null);
  assert.equal(youtubeReplyTarget(target.split('&lc=')[0]),null);
});

test('the final public reply uses the selected name and WhatsApp without changing the edited body',()=>{
  const draft = 'Texto editado por Lucas.';
  const result = signedCommercialReply(draft,{name:'Comercial Pisos',whatsapp:'(31) 99876-1234'});
  assert.ok(result.startsWith(draft+'\n\n'));
  assert.match(result,/\(31\) 99876-1234/);
  assert.ok(result.endsWith('Comercial Pisos'));
  assert.equal(signedCommercialReply(draft,{name:'Comercial Pisos',whatsapp:'1234'}),'');
});
