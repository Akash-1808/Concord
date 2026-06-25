import { expect, describe, it } from "vitest"
import { increment, merge, compare } from '../src/vclock'

describe('increment', () => {
    it('creates entry from empty clock', () => {
        const empty = {};
        const result = increment(empty, 'alice');
        expect(result).toEqual({ alice: 1 });
    })
    it('bumps existing counter', () => {
        const clock = { alice: 2, bob: 1 };
        const result = increment(clock, 'alice');
        expect(result).toEqual({ alice: 3, bob: 1 });
    })
    it('does not mutate other entries', () => {
        const clock = { alice: 1, bob: 1 };
        const result = increment(clock, 'alice');
        expect(clock).toEqual({ alice: 1, bob: 1 });
    })
})
describe('merge', () => {
    it('merges two disjoint clocks', () => {
        // merge({ alice: 2 }, { bob: 3 }) → { alice: 2, bob: 3 }
        const a = { alice: 2 };
        const b = { bob: 3 };
        const result = merge(a, b);
        expect(result).toEqual({ alice: 2, bob: 3 });
    });

    it('takes max of overlapping keys', () => {
        // merge({ alice: 3, bob: 1 }, { alice: 1, bob: 5 }) → { alice: 3, bob: 5 }
        const a = { alice: 3, bob: 1 };
        const b = { alice: 1, bob: 5 };
        const result = merge(a, b);
        expect(result).toEqual({ alice: 3, bob: 5 });
    });

    it('handles empty clock', () => {
        // merge({}, { alice: 2 }) → { alice: 2 }
        const a = {};
        const b = { alice: 2 };
        const result = merge(a, b);
        expect(result).toEqual({ alice: 2 });
    });
});

describe('compare', () => {
    it('returns "before" when a happened before b', () => {
        // compare({ alice: 1 }, { alice: 1, bob: 1 }) → 'before'
        // a is a subset — b has seen everything a saw, plus more
        const a = { alice: 1 };
        const b = { alice: 1, bob: 1 };
        const result = compare(a, b);
        expect(result).toEqual('before');
    });

    it('returns "after" when a happened after b', () => {
        // compare({ alice: 2, bob: 1 }, { alice: 1 }) → 'after'
        const a = { alice: 2, bob: 1 };
        const b = { alice: 1 };
        const result = compare(a, b);
        expect(result).toEqual('after');
    });

    it('returns "concurrent" when neither dominates', () => {
        // compare({ alice: 3, bob: 1 }, { alice: 1, bob: 3 }) → 'concurrent'
        // alice ahead on one key, bob ahead on other — THIS triggers conflict resolution
        const a = { alice: 3, bob: 1 };
        const b = { alice: 1, bob: 3 };
        const result = compare(a, b);
        expect(result).toEqual('concurrent');
    });
});
