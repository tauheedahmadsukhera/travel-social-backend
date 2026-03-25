import { extractHashtags, extractMentions } from '../lib/mentions';

describe('mentions & hashtags parsing', () => {
  it('extracts unique hashtags and ignores punctuation', () => {
    const result = extractHashtags('Loving the #beach, #sun, and #beach vibes! #Sun');
    const tags = result.map((h) => h.tag);
    expect(tags).toEqual(['beach', 'sun']);
  });

  it('extracts mentions with correct positions', () => {
    const text = 'Hi @alice, meet @bob!';
    const result = extractMentions(text);
    expect(result.map((m) => m.username)).toEqual(['alice', 'bob']);
    expect(result[0].index).toBe(text.indexOf('@alice'));
  });
});
