function metricValue(data, metricName, valueName) {
  const metric = data.metrics && data.metrics[metricName];
  if (!metric || !metric.values) {
    return 'n/a';
  }
  const value = metric.values[valueName];
  return value === undefined ? 'n/a' : value;
}

function humanSummary(data, metadata) {
  const lines = [
    `${metadata.testName} summary`,
    `runId: ${metadata.runId}`,
    `environment: ${metadata.environment}`,
    `target: ${metadata.target}`,
    `checks rate: ${metricValue(data, 'checks', 'rate')}`,
    `http requests: ${metricValue(data, 'http_reqs', 'count')}`,
    `http p95 (ms): ${metricValue(data, 'http_req_duration', 'p(95)')}`,
  ];
  return `${lines.join('\n')}\n`;
}

export function buildSummary(data, metadata, jsonPath, textPath) {
  const document = {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    metadata,
    k6: data,
  };
  const text = humanSummary(data, metadata);
  return {
    stdout: text,
    [jsonPath]: `${JSON.stringify(document, null, 2)}\n`,
    [textPath]: text,
  };
}
