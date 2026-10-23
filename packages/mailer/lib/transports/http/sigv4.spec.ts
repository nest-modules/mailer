import { signV4 } from './sigv4';

// The example credentials and date of the AWS Signature Version 4 test suite
const credentials = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
};
const date = new Date('2015-08-30T12:36:00Z');
const scope = { credentials, region: 'us-east-1', service: 'service', date };

describe('signV4', () => {
  it('should match the AWS test suite: get-vanilla', () => {
    const signed = signV4(
      { method: 'GET', url: 'https://example.amazonaws.com/' },
      scope,
    );
    expect(signed.canonicalRequest).toBe(
      [
        'GET',
        '/',
        '',
        'host:example.amazonaws.com',
        'x-amz-date:20150830T123600Z',
        '',
        'host;x-amz-date',
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      ].join('\n'),
    );
    expect(signed.stringToSign).toBe(
      [
        'AWS4-HMAC-SHA256',
        '20150830T123600Z',
        '20150830/us-east-1/service/aws4_request',
        'bb579772317eb040ac9ed261061d46c1f17a8133879d6129b6e1c25292927e63',
      ].join('\n'),
    );
    expect(signed.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
    expect(signed.headers).toEqual({
      'x-amz-date': '20150830T123600Z',
      authorization: signed.authorization,
    });
  });

  it('should match the AWS test suite: post-vanilla', () => {
    const signed = signV4(
      { method: 'post', url: new URL('https://example.amazonaws.com/') },
      scope,
    );
    expect(signed.signature).toBe(
      '5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b',
    );
  });

  it('should match the AWS test suite: get-vanilla-query-order-key-case', () => {
    const signed = signV4(
      {
        method: 'GET',
        url: 'https://example.amazonaws.com/?Param2=value2&Param1=value1',
      },
      scope,
    );
    expect(signed.canonicalRequest.split('\n')[2]).toBe(
      'Param1=value1&Param2=value2',
    );
    expect(signed.signature).toBe(
      'b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500',
    );
  });

  it('should match the IAM example of the AWS documentation', () => {
    const signed = signV4(
      {
        method: 'GET',
        url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
      },
      { credentials, region: 'us-east-1', service: 'iam', date },
    );
    expect(signed.signature).toBe(
      '5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7',
    );
    expect(signed.authorization).toContain(
      'SignedHeaders=content-type;host;x-amz-date,',
    );
  });

  it('should sign the session token, the body and normalized header values', () => {
    const signed = signV4(
      {
        method: 'POST',
        url: 'https://email.eu-west-1.amazonaws.com:8443/v2/a%40b/x(1)',
        headers: { 'X-Custom': '  a   b  ' },
        body: Buffer.from('{}'),
      },
      {
        credentials: { ...credentials, sessionToken: 'token' },
        region: 'eu-west-1',
        service: 'ses',
        date,
      },
    );
    const lines = signed.canonicalRequest.split('\n');
    // Each segment of the wire path is encoded again, as the AWS SDKs do
    expect(lines[1]).toBe('/v2/a%2540b/x%281%29');
    expect(lines).toContain('host:email.eu-west-1.amazonaws.com:8443');
    expect(lines).toContain('x-custom:a b');
    expect(lines).toContain('x-amz-security-token:token');
    expect(lines.at(-1)).toBe(
      '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
    );
    expect(signed.headers['x-amz-security-token']).toBe('token');
    expect(signed.stringToSign).toContain(
      '20150830/eu-west-1/ses/aws4_request',
    );
  });

  it('should sort repeated query keys by value and encode them', () => {
    const signed = signV4(
      {
        method: 'GET',
        url: 'https://x.amazonaws.com/?b=2&a=z&a=y%20%2A&c&a=0&a=zz',
      },
      scope,
    );
    expect(signed.canonicalRequest.split('\n')[2]).toBe(
      'a=0&a=y%20%2A&a=z&a=zz&b=2&c=',
    );
  });

  it('should default the date to now', () => {
    const signed = signV4(
      { method: 'GET', url: 'https://x.amazonaws.com/' },
      { credentials, region: 'us-east-1', service: 'service' },
    );
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    expect(signed.headers['x-amz-date'].startsWith(today)).toBe(true);
  });
});
