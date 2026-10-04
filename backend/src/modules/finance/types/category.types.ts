/** Predefinida (R07): `userId` nulo e `systemKey` preenchida. Personalizada (R08): pertence a um usuário. */
export interface Category {
  id: string;
  userId: string | null;
  systemKey: string | null;
  name: string;
  deletedAt: Date | null;
}
