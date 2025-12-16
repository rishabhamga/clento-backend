import { CreateUserDto, UpdateUserDto, UserResponseDto } from "../../dto/reporterDtos/users.dto";
import { BaseRepository } from "../BaseRepository";


export class UserRepository extends BaseRepository<UserResponseDto, CreateUserDto, UpdateUserDto>{
    constructor() {
        super('reporter_users');
    }
}