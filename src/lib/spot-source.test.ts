import { expect, test } from 'bun:test';
import { suggestSpotSource } from './spot-source';

test('matches surrounding sky, avoids the target and existing corrections', () => {
	const width=200,height=160,data=new Uint8ClampedArray(width*height*4);
	for(let y=0;y<height;y++)for(let x=0;x<width;x++){ const i=(y*width+x)*4;data.set(y<90?[100,160,220,255]:[30,40,30,255],i); }
	const target={x:100,y:45};
	const source=suggestSpotSource({width,height,data},target,8,.5,[{x:130,y:45,radius:20}])!;
	expect(source).toBeDefined();
	expect(source.y).toBeLessThan(76);
	expect(Math.hypot(source.x-100,source.y-45)).toBeGreaterThan(26);
	expect(Math.hypot(source.x-130,source.y-45)).toBeGreaterThan(34);
});
test('handles edge targets and returns no unsafe source when the brush cannot fit', () => {
	const pixels={width:100,height:100,data:new Uint8ClampedArray(40000)};
	expect(suggestSpotSource(pixels,{x:99,y:3},5,.5)).toBeDefined();
	expect(suggestSpotSource(pixels,{x:50,y:50},80,1)).toBeUndefined();
});
