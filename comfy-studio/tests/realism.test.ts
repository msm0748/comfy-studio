import test from 'node:test';import assert from 'node:assert/strict';
import {withImageRealism,withVideoRealism,withMusicRealism,IMAGE_REALISM} from '../lib/realism.ts';
test('photo prompts gain realism cues; stylized media stay untouched',()=>{
 assert.equal(withImageRealism('A woman at a cafe.'),'A woman at a cafe. '+IMAGE_REALISM);
 for(const p of ['Anime girl on a rooftop','A watercolor of a fox','Minimal logo for a bakery','3D render of a chair'])assert.equal(withImageRealism(p),p);
 assert.match(withVideoRealism('A man walks'),/live-action camera footage/);assert.equal(withVideoRealism('Cartoon cat dancing'),'Cartoon cat dancing');
});
test('music cues are genre-neutral and add breath only for vocals',()=>{
 assert.match(withMusicRealism('indie ballad,','vocal'),/^indie ballad, organic human performance.*audible breaths$/);
 assert.doesNotMatch(withMusicRealism('lofi','instrumental'),/vocal/);
});
