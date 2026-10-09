import { NullLlmGateway, OpenAiLlmGateway, parseExplanations } from './llm.gateway';

describe('parseExplanations', () => {
  it('reads the happy path', () => {
    const map = parseExplanations('{"items":[{"id":"p1","reason":"Thrives in low light"}]}');

    expect(map.get('p1')).toBe('Thrives in low light');
  });

  it('ignores an empty response', () => {
    expect(parseExplanations('').size).toBe(0);
  });

  it('ignores invalid JSON rather than throwing at the customer', () => {
    expect(parseExplanations('sorry, I cannot do that').size).toBe(0);
  });

  it('ignores a response with the wrong shape', () => {
    expect(parseExplanations('{"items":"nope"}').size).toBe(0);
    expect(parseExplanations('{"foo":1}').size).toBe(0);
  });

  it('skips malformed entries but keeps the good ones', () => {
    const map = parseExplanations(
      '{"items":[{"id":1,"reason":"x"},{"id":"p2"},{"id":"p3","reason":"Good in shade"}]}',
    );

    expect([...map.keys()]).toEqual(['p3']);
  });

  it('collapses whitespace and truncates runaway output', () => {
    const long = 'a'.repeat(400);
    const map = parseExplanations(`{"items":[{"id":"p1","reason":"  two\\n\\nwords ${long}"}]}`);

    expect(map.get('p1')!.length).toBe(120);
    expect(map.get('p1')!.startsWith('two words')).toBe(true);
  });

  it('drops a blank reason', () => {
    expect(parseExplanations('{"items":[{"id":"p1","reason":"   "}]}').size).toBe(0);
  });
});

describe('NullLlmGateway', () => {
  it('reports itself unavailable and returns nothing', async () => {
    const gateway = new NullLlmGateway();

    expect(gateway.available).toBe(false);
    await expect(gateway.explain()).resolves.toEqual(new Map());
  });
});

describe('OpenAiLlmGateway', () => {
  const request = { shopper: 'a new shopper', items: [{ id: 'p1', plant: 'Fern', facts: ['x'] }] };
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns the parsed blurbs', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"items":[{"id":"p1","reason":"Loves shade"}]}' } }],
      }),
    }) as unknown as typeof fetch;

    const map = await new OpenAiLlmGateway('sk-test').explain(request);

    expect(map.get('p1')).toBe('Loves shade');
  });

  it('degrades to rule-based reasons when the provider errors', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 429 }) as unknown as typeof fetch;

    await expect(new OpenAiLlmGateway('sk-test').explain(request)).resolves.toEqual(new Map());
  });

  it('degrades when the call throws or times out', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('aborted')) as unknown as typeof fetch;

    await expect(new OpenAiLlmGateway('sk-test').explain(request)).resolves.toEqual(new Map());
  });

  it('never sends the facts as free text the model could ignore — ids are included', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"items":[]}' } }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await new OpenAiLlmGateway('sk-test').explain(request);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.messages[0].content).toContain('id=p1');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });
});
