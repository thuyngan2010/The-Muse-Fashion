import { describe, it, expect } from 'vitest';
import { AppConfig } from './app-config.js';
describe('AppConfig',()=>{
 it('returns undefined for a missing optional configuration',()=>expect(AppConfig.optional('__NO_SUCH_ENV__')).toBeUndefined());
 it('rejects absent required configuration',()=>expect(()=>AppConfig.require('__NO_SUCH_ENV__')).toThrow());
 it('parses boolean configuration strictly',()=>{
   process.env.__TEST_BOOLEAN__='true';
   expect(AppConfig.boolean('__TEST_BOOLEAN__')).toBe(true);
   process.env.__TEST_BOOLEAN__='invalid';
   expect(()=>AppConfig.boolean('__TEST_BOOLEAN__')).toThrow();
   delete process.env.__TEST_BOOLEAN__;
 });
 it('parses comma-separated configuration',()=>{
   process.env.__TEST_CSV__='https://a.example, https://b.example';
   expect(AppConfig.csv('__TEST_CSV__')).toEqual(['https://a.example','https://b.example']);
   delete process.env.__TEST_CSV__;
 });
});
