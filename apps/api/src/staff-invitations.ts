import { createClient } from "@supabase/supabase-js";

export type StaffInvitationService = {
  inviteOperator(email: string): Promise<{ userId: string }>;
  revokeInvitedUser(userId: string): Promise<void>;
};

type SupabaseStaffInvitationOptions = {
  redirectTo: string;
  serviceRoleKey: string;
  supabaseUrl: string;
};

export function createSupabaseStaffInvitationService(
  options: SupabaseStaffInvitationOptions,
): StaffInvitationService {
  const supabase = createClient(options.supabaseUrl, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    async inviteOperator(email) {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(
        email,
        { redirectTo: options.redirectTo },
      );
      if (error || !data.user) {
        throw new Error("supabase_operator_invitation_failed", {
          cause: error,
        });
      }
      return { userId: data.user.id };
    },
    async revokeInvitedUser(userId) {
      const { error } = await supabase.auth.admin.deleteUser(userId, false);
      if (error) {
        throw new Error("supabase_invitation_rollback_failed", { cause: error });
      }
    },
  };
}
