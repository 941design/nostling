/**
 * Tests for URL Detection and Parsing in Message Content
 */

import { parseMessageContent, isValidUrl } from './linkify';

describe('isValidUrl', () => {
  it('accepts http URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  it('accepts https URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
  });

  it('rejects javascript: URLs', () => {
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: URLs', () => {
    expect(isValidUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
  });
});

describe('parseMessageContent', () => {
  describe('plain text', () => {
    it('returns single text segment for plain text', () => {
      const segments = parseMessageContent('Hello, world!');
      expect(segments).toEqual([{ type: 'text', content: 'Hello, world!' }]);
    });

    it('handles empty string', () => {
      const segments = parseMessageContent('');
      expect(segments).toEqual([{ type: 'text', content: '' }]);
    });

    it('preserves whitespace', () => {
      const segments = parseMessageContent('Hello\n\nWorld  with  spaces');
      expect(segments).toEqual([{ type: 'text', content: 'Hello\n\nWorld  with  spaces' }]);
    });
  });

  describe('URLs', () => {
    it('detects https URL', () => {
      const segments = parseMessageContent('Check this: https://example.com');
      expect(segments).toEqual([
        { type: 'text', content: 'Check this: ' },
        { type: 'link', url: 'https://example.com', displayText: 'https://example.com' },
      ]);
    });

    it('detects http URL', () => {
      const segments = parseMessageContent('Link: http://example.com');
      expect(segments).toEqual([
        { type: 'text', content: 'Link: ' },
        { type: 'link', url: 'http://example.com', displayText: 'http://example.com' },
      ]);
    });

    it('detects URL with path', () => {
      const segments = parseMessageContent('See https://example.com/path/to/page');
      expect(segments).toEqual([
        { type: 'text', content: 'See ' },
        { type: 'link', url: 'https://example.com/path/to/page', displayText: 'https://example.com/path/to/page' },
      ]);
    });

    it('detects URL with query params', () => {
      const segments = parseMessageContent('https://example.com/search?q=test&page=1');
      expect(segments).toEqual([
        { type: 'link', url: 'https://example.com/search?q=test&page=1', displayText: 'https://example.com/search?q=test&page=1' },
      ]);
    });

    it('handles URL at end of sentence with period', () => {
      const segments = parseMessageContent('Check this out: https://example.com.');
      expect(segments).toEqual([
        { type: 'text', content: 'Check this out: ' },
        { type: 'link', url: 'https://example.com', displayText: 'https://example.com' },
        { type: 'text', content: '.' },
      ]);
    });

    it('handles URL followed by comma', () => {
      const segments = parseMessageContent('Visit https://example.com, then do something');
      expect(segments).toEqual([
        { type: 'text', content: 'Visit ' },
        { type: 'link', url: 'https://example.com', displayText: 'https://example.com' },
        { type: 'text', content: ', then do something' },
      ]);
    });

    it('handles URL in parentheses', () => {
      const segments = parseMessageContent('More info (https://example.com)');
      expect(segments).toEqual([
        { type: 'text', content: 'More info (' },
        { type: 'link', url: 'https://example.com', displayText: 'https://example.com' },
        { type: 'text', content: ')' },
      ]);
    });
  });

  describe('multiple URLs', () => {
    it('detects multiple URLs in text', () => {
      const segments = parseMessageContent('Check https://foo.com and https://bar.com');
      expect(segments).toEqual([
        { type: 'text', content: 'Check ' },
        { type: 'link', url: 'https://foo.com', displayText: 'https://foo.com' },
        { type: 'text', content: ' and ' },
        { type: 'link', url: 'https://bar.com', displayText: 'https://bar.com' },
      ]);
    });

    it('handles URLs on multiple lines', () => {
      const segments = parseMessageContent('Line 1: https://foo.com\nLine 2: https://bar.com');
      expect(segments).toEqual([
        { type: 'text', content: 'Line 1: ' },
        { type: 'link', url: 'https://foo.com', displayText: 'https://foo.com' },
        { type: 'text', content: '\nLine 2: ' },
        { type: 'link', url: 'https://bar.com', displayText: 'https://bar.com' },
      ]);
    });
  });

  describe('complex URLs', () => {
    it('handles URLs with fragments', () => {
      const segments = parseMessageContent('https://example.com/page#section');
      expect(segments).toEqual([
        { type: 'link', url: 'https://example.com/page#section', displayText: 'https://example.com/page#section' },
      ]);
    });

    it('handles URLs with port', () => {
      const segments = parseMessageContent('http://localhost:3000/path');
      expect(segments).toEqual([
        { type: 'link', url: 'http://localhost:3000/path', displayText: 'http://localhost:3000/path' },
      ]);
    });

    it('handles URLs with encoded characters', () => {
      const segments = parseMessageContent('https://example.com/path%20with%20spaces');
      expect(segments).toEqual([
        { type: 'link', url: 'https://example.com/path%20with%20spaces', displayText: 'https://example.com/path%20with%20spaces' },
      ]);
    });
  });

  describe('edge cases', () => {
    it('does not detect ftp: URLs', () => {
      const segments = parseMessageContent('ftp://example.com');
      expect(segments).toEqual([{ type: 'text', content: 'ftp://example.com' }]);
    });

    it('does not detect javascript: URLs', () => {
      const segments = parseMessageContent('javascript:alert(1)');
      expect(segments).toEqual([{ type: 'text', content: 'javascript:alert(1)' }]);
    });

    it('handles text that looks like URL but is not', () => {
      const segments = parseMessageContent('example.com is a domain');
      expect(segments).toEqual([{ type: 'text', content: 'example.com is a domain' }]);
    });
  });
});
