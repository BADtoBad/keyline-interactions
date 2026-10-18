import test from 'node:test';
import assert from 'node:assert/strict';
import {isMentionTextBoundary,readMentionSession,findMentionPages,MENTION_DATES,mentionMatches,mentionWikilink} from './.build/mentionModel.js';

test('writing boundaries support Chinese and punctuation, but not email local-parts',()=>{
  for(const value of ['', '中文', 'hello ', '（', '- ', '> ', '**重点** ', '“']) assert.equal(isMentionTextBoundary(value),true,value);
  for(const value of ['user','first.last','user+tag','café','９','foo%bar','foo!','foo=','foo~','foo`','\\','@','https://host/']) assert.equal(isMentionTextBoundary(value),false,value);
});
test('incomplete links, code, HTML and math do not launch mentions',()=>{
  for(const value of ['[[', '[[页面|', '[描述 ', '[x]( ', '`code ', '``code ` ', '<tag attr=" ', '$a + ']) assert.equal(isMentionTextBoundary(value),false,value);
  for(const value of ['[[页面]] ', '[描述](target) ', '`code` ', '``code ` `` ', '<tag> ', '$a + b$ ']) assert.equal(isMentionTextBoundary(value),true,value);
});
test('session reads preserve literal text, spaces, Chinese, and path queries',()=>{
  assert.deepEqual(readMentionSession('正文@AI 工作/项目',2,11),{from:2,to:11,query:'AI 工作/项目'});
  assert.equal(readMentionSession('@abc',0,0),null);
  for(const value of ['xabc','@x\ny','@x@y','@[x]','@'+ 'a'.repeat(121)]) assert.equal(readMentionSession(value,0,value.length),null,value);
});
test('date shortcuts have no people or fake reminders; filter by CN or EN',()=>{
  assert.deepEqual(MENTION_DATES.map(d=>d.id),['today','tomorrow','yesterday','time']);
  assert.equal(MENTION_DATES.filter(d=>mentionMatches('now',d.label,d.keywords))[0].id,'time');
});
test('page results disambiguate folders, rank exact titles and remain bounded',()=>{
  const pages=Array.from({length:100},(_,i)=>({path:`Folder${i}/Project ${i}.md`,basename:`Project ${i}`,modified:i}));
  assert.equal(findMentionPages(pages,'').length,12);
  assert.equal(findMentionPages(pages,'')[0].modified,99);
  assert.equal(findMentionPages(pages,'Project 1')[0].basename,'Project 1');
  assert.equal(findMentionPages(pages,'Folder99 Project')[0].path,'Folder99/Project 99.md');
  assert.deepEqual(findMentionPages(pages,'unmatched'),[]);
});
test('wikilink insertion keeps a resolved path; unsafe syntax fails without rewriting',()=>{
  assert.equal(mentionWikilink('工作/项目 A'),'[[工作/项目 A]]');
  assert.equal(mentionWikilink('项目.v2'),'[[项目.v2]]');
  for(const path of ['', 'a|b','a#b','a^b','a[b]','a\nb']) assert.equal(mentionWikilink(path),null);
});
