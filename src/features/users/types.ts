import type { AppRole } from "@/features/auth/session";

export type ManagedUser = {
  id: string;
  email: string;
  displayName: string;
  role: AppRole;
  isActive: boolean;
  createdAt: string;
};

export type UserFormState = {
  error?: string;
  success?: string;
  fieldErrors?: {
    displayName?: string;
    email?: string;
    role?: string;
    password?: string;
    confirmPassword?: string;
  };
  createdUser?: Pick<ManagedUser, "id" | "email" | "displayName" | "role">;
};

export type UserActionResult = {
  error?: string;
  success?: string;
};
