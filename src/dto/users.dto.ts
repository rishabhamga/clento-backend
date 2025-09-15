import { z } from 'zod';

/**
 * DTO for creating a user
 */
export const CreateUserDto = z.object({
  externalId: z.string().nonempty('External ID is required'),
  email: z.string().email('Invalid email format'),
  fullName: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

export type CreateUserDtoType = z.infer<typeof CreateUserDto>;

/**
 * DTO for updating a user
 */
export const UpdateUserDto = z.object({
  fullName: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

export type UpdateUserDtoType = z.infer<typeof UpdateUserDto>;
