const { OPEN_STATUSES, isoDate, domain } = require('../helpers/contract');

const { isOverdue } = domain.overdue();

const today = isoDate(0);

describe('TC-UNIT-03 RD-06 / FR-008 / FR-015 (BVA): overdue is derived from the target date boundary', () => {
  test.each([
    ['one day before today', isoDate(-1), true],
    ['exactly today', isoDate(0), false],
    ['one day after today', isoDate(1), false]
  ])('open request with target date %s -> overdue=%s', (_label, target, expected) => {
    expect(isOverdue({ status: 'in_progress', targetResolutionDate: target }, today)).toBe(expected);
  });

  test.each(['accepted', 'assigned', 'in_progress', 'on_hold'])(
    'past target date is overdue while status is %s',
    (status) => {
      expect(isOverdue({ status, targetResolutionDate: isoDate(-30) }, today)).toBe(true);
    }
  );

  test.each(['resolved', 'closed', 'rejected'])(
    'past target date is never overdue once status is %s',
    (status) => {
      expect(isOverdue({ status, targetResolutionDate: isoDate(-30) }, today)).toBe(false);
    }
  );

  it('is not overdue when no target date has been recorded', () => {
    expect(isOverdue({ status: 'submitted', targetResolutionDate: null }, today)).toBe(false);
  });

  it('only treats the defined open statuses as eligible for overdue', () => {
    const eligible = OPEN_STATUSES.filter((status) =>
      isOverdue({ status, targetResolutionDate: isoDate(-1) }, today)
    );
    expect(eligible.sort()).toEqual(['accepted', 'assigned', 'in_progress', 'on_hold']);
  });
});
