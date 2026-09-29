import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { sanitizeImage } from '../src/file/file.service.js';
import { DomainError } from '../src/common/errors.js';
test('actual JPEG decoding strips EXIF instead of trusting supplied MIME',async()=>{
 const input=await sharp({create:{width:8,height:8,channels:3,background:'#aabbcc'}}).jpeg().withMetadata({exif:{IFD0:{Artist:'private-name'}}}).toBuffer();
 assert.ok((await sharp(input).metadata()).exif);
 const clean=await sanitizeImage(input);assert.equal(clean.mimeType,'image/jpeg');assert.equal((await sharp(clean.buffer).metadata()).exif,undefined);
});
test('unsupported and corrupt formats plus size limit are rejected',async()=>{
 await assert.rejects(()=>sanitizeImage(Buffer.from('<svg/>')),(e:unknown)=>e instanceof DomainError&&e.status===415);
 await assert.rejects(()=>sanitizeImage(Buffer.alloc(5242881)),(e:unknown)=>e instanceof DomainError&&e.status===413);
 await assert.rejects(()=>sanitizeImage(Buffer.from([0xff,0xd8,0xff,0xe0])),(e:unknown)=>e instanceof DomainError&&e.status===415);
});
