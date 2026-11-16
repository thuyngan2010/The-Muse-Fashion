import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './user.schema.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { Address, AddressSchema, AuthSession, AuthSessionSchema, EmailToken, EmailTokenSchema, StaffPermission, StaffPermissionSchema } from './identity.schemas.js';
import { MediaObject, MediaObjectSchema } from '../storage/media-object.schema.js';
import { Order, OrderSchema } from '../commerce/commerce.schemas.js';
@Module({imports:[MongooseModule.forFeature([
  {name:User.name,schema:UserSchema},{name:Address.name,schema:AddressSchema},{name:AuthSession.name,schema:AuthSessionSchema},
  {name:EmailToken.name,schema:EmailTokenSchema},{name:StaffPermission.name,schema:StaffPermissionSchema},
  {name:MediaObject.name,schema:MediaObjectSchema},
  {name:Order.name,schema:OrderSchema},
])],controllers:[UsersController],providers:[UsersService],exports:[UsersService]})
export class UsersModule {}
