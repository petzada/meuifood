import { describe, expect, it, vi } from "vitest";

import { provisionOwner } from "./owner-provisioning.js";

describe("provisionamento do Dono", () => {
  it("convida pelo Auth e persiste a membership owner da Loja", async () => {
    const createOwnerMembership = vi.fn(async () => undefined);
    const inviteMember = vi.fn(async () => ({ userId: "owner-user-id" }));
    const revokeInvitedUser = vi.fn(async () => undefined);

    await provisionOwner(
      { createOwnerMembership },
      { inviteMember, revokeInvitedUser },
      { email: "dono@example.com", storeId: "store-id" },
    );

    expect(inviteMember).toHaveBeenCalledWith("dono@example.com");
    expect(createOwnerMembership).toHaveBeenCalledWith(
      "store-id",
      "owner-user-id",
    );
    expect(revokeInvitedUser).not.toHaveBeenCalled();
  });

  it("revoga o usuário convidado quando a membership falha", async () => {
    const failure = new Error("membership_failed");
    const revokeInvitedUser = vi.fn(async () => undefined);

    await expect(
      provisionOwner(
        {
          createOwnerMembership: async () => {
            throw failure;
          },
        },
        {
          inviteMember: async () => ({ userId: "owner-user-id" }),
          revokeInvitedUser,
        },
        { email: "dono@example.com", storeId: "store-id" },
      ),
    ).rejects.toBe(failure);
    expect(revokeInvitedUser).toHaveBeenCalledWith("owner-user-id");
  });
});
