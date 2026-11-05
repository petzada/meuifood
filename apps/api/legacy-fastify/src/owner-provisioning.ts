import type { MemberInvitationService } from "./member-invitations.js";

type OwnerMembershipRepository = {
  createOwnerMembership(storeId: string, userId: string): Promise<void>;
};

type OwnerInvitationService = Pick<
  MemberInvitationService,
  "inviteMember" | "revokeInvitedUser"
>;

export async function provisionOwner(
  repository: OwnerMembershipRepository,
  invitations: OwnerInvitationService,
  input: { email: string; storeId: string },
) {
  const invited = await invitations.inviteMember(input.email);
  try {
    await repository.createOwnerMembership(input.storeId, invited.userId);
  } catch (error) {
    await invitations.revokeInvitedUser(invited.userId);
    throw error;
  }
}
