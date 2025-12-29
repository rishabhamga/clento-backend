import { z } from 'zod';
// id uuid not null default gen_random_uuid (),
// first_name text not null,
// last_name text not null,
// email text not null,
// password_md5 text not null,
// updated_at timestamp with time zone not null,
// created_at timestamp with time zone not null

const UserCreateDto = z.object({
    first_name: z.string(),
    last_name: z.string(),
    email: z.string().email(),
    password_md5: z.string(),
    updated_at: z.string().datetime().optional().default(new Date().toISOString()),
    created_at: z.string().datetime().optional().default(new Date().toISOString()),
});
const UserUpdateDto = z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    email: z.string().email().optional(),
    password_md5: z.string().optional(),
    updated_at: z.string().datetime().optional().default(new Date().toISOString()),
});
const UserResponseDto = z.object({
    id: z.string().uuid(),
    first_name: z.string(),
    last_name: z.string(),
    email: z.string().email(),
    password_md5: z.string(),
    updated_at: z.string().datetime().default(new Date().toISOString()),
    created_at: z.string().datetime().default(new Date().toISOString()),
    is_superuser: z.boolean()
});

// Type exports
export type CreateUserDto = z.infer<typeof UserCreateDto>;
export type UpdateUserDto = z.infer<typeof UserUpdateDto>;
export type UserResponseDto = z.infer<typeof UserResponseDto>;
