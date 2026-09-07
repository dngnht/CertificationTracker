/**
 * Pure authorization rules for certificate access.
 * Kept dependency-free so they can be unit tested.
 */

/**
 * Whether `userId` may access a member certification owned by `ownerId`.
 * Owners always can; admins can access everything.
 */
export function canAccessMemberCertification(
  userId: string,
  ownerId: string,
  role: "MEMBER" | "ADMIN"
): boolean {
  return role === "ADMIN" || userId === ownerId;
}

/**
 * Whether `userId` may mutate a member certification (upload, delete, edit).
 * Same rule as read access.
 */
export function canMutateMemberCertification(
  userId: string,
  ownerId: string,
  role: "MEMBER" | "ADMIN"
): boolean {
  return canAccessMemberCertification(userId, ownerId, role);
}