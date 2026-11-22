describe('runtime', () => {
  it('runs on Node >= 22', () => {
    expect(Number(process.versions.node.split('.')[0])).toBeGreaterThanOrEqual(22);
  });
});
