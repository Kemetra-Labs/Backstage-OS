// The list filter (BACK-50 server slice): pure, no database.
import { projectFilter } from '../../src/investigations/investigation.controller';
import { PROJECT_VISIBLE } from '../../src/evidence/visibility';

describe('projectFilter', () => {
  it('is empty when absent', () => {
    expect(projectFilter({})).toEqual({});
  });

  it('passes one string through (the repository validates it as a UUID)', () => {
    expect(projectFilter({ projectId: 'abc' })).toEqual({ projectId: 'abc' });
  });

  it.each([[['a', 'b']], [{ x: 1 }], [5]])('refuses a repeated or non-string value (%j): matches nothing', (v) => {
    expect(projectFilter({ projectId: v })).toBeNull();
  });
});

describe('PROJECT_VISIBLE', () => {
  it('requires an active, unrevoked grant for the given user on a source of the given project', () => {
    const sql = PROJECT_VISIBLE('i.project_id', '$7');
    expect(sql).toContain('vg.user_id = $7');
    expect(sql).toContain('vg.revoked_at IS NULL');
    expect(sql).toContain('vs.project_id = i.project_id');
  });

  it('defaults the user to $1', () => {
    expect(PROJECT_VISIBLE('p.id')).toContain('vg.user_id = $1');
  });
});
