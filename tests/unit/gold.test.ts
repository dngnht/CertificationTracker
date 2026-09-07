import { describe, it, expect } from "vitest";

import { awardGoldOnVerify } from "@/features/gold/award";

function makeFakeTx() {
  const store = new Map<string, unknown>();
  return {
    store,
    tx: {
      goldTransaction: {
        findUnique: async ({ where }: { where: { sourceKey: string } }) =>
          store.get(where.sourceKey) ?? null,
        create: async ({ data }: { data: { sourceKey: string } }) => {
          store.set(data.sourceKey, data);
          return data;
        },
      },
    },
  };
}

describe("awardGoldOnVerify", () => {
  it("credits the reward exactly once", async () => {
    const { tx } = makeFakeTx();
    const first = await awardGoldOnVerify(tx, {
      memberId: "m1",
      certificationId: "c1",
      reward: 500,
    });
    const second = await awardGoldOnVerify(tx, {
      memberId: "m1",
      certificationId: "c1",
      reward: 500,
    });
    expect(first).toEqual({ awarded: true, amount: 500 });
    expect(second).toEqual({ awarded: false, amount: 0 });
  });

  it("zero reward writes no ledger row", async () => {
    const { tx, store } = makeFakeTx();
    const result = await awardGoldOnVerify(tx, {
      memberId: "m1",
      certificationId: "c1",
      reward: 0,
    });
    expect(result.awarded).toBe(false);
    expect(store.size).toBe(0);
  });

  it("different member+cert pairs award independently", async () => {
    const { tx } = makeFakeTx();
    const a = await awardGoldOnVerify(tx, { memberId: "m1", certificationId: "c1", reward: 100 });
    const b = await awardGoldOnVerify(tx, { memberId: "m2", certificationId: "c1", reward: 100 });
    expect(a.awarded).toBe(true);
    expect(b.awarded).toBe(true);
  });
});