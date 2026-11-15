import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const users=sqliteTable('users',{
 id:text('id').primaryKey(),email:text('email').notNull().unique(),name:text('name').notNull(),
 role:text('role').notNull().default('user'),status:text('status').notNull().default('active'),
 passwordHash:text('password_hash'),identityId:text('identity_id').unique(),quota:integer('quota').notNull().default(60),
 createdAt:integer('created_at').notNull(),lastLogin:integer('last_login').notNull(),
});
export const bootstrap=sqliteTable('bootstrap',{slot:integer('slot').primaryKey(),userId:text('user_id').notNull().references(()=>users.id)});
export const sessions=sqliteTable('sessions',{tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),csrf:text('csrf').notNull(),expiresAt:integer('expires_at').notNull()},t=>[index('sessions_user').on(t.userId)]);
export const conversations=sqliteTable('conversations',{id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),title:text('title').notNull(),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),deletedAt:integer('deleted_at')},t=>[index('conversations_owner').on(t.userId,t.updatedAt)]);
export const messages=sqliteTable('messages',{id:text('id').primaryKey(),conversationId:text('conversation_id').notNull().references(()=>conversations.id,{onDelete:'cascade'}),role:text('role').notNull(),content:text('content').notNull(),createdAt:integer('created_at').notNull(),model:text('model'),status:text('status').notNull().default('complete')},t=>[index('messages_conversation').on(t.conversationId,t.createdAt)]);
export const settings=sqliteTable('settings',{key:text('key').primaryKey(),value:text('value').notNull(),updatedAt:integer('updated_at').notNull()});
export const usage=sqliteTable('usage',{id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),kind:text('kind').notNull(),model:text('model').notNull(),status:text('status').notNull(),units:integer('units').notNull().default(0),createdAt:integer('created_at').notNull()},t=>[index('usage_user_date').on(t.userId,t.createdAt)]);
export const audit=sqliteTable('audit',{id:text('id').primaryKey(),actorId:text('actor_id').notNull(),action:text('action').notNull(),targetId:text('target_id'),detail:text('detail').notNull(),createdAt:integer('created_at').notNull()});
export const limits=sqliteTable('limits',{key:text('key').primaryKey(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull()});
export const resets=sqliteTable('resets',{tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),expiresAt:integer('expires_at').notNull()});
export const locks=sqliteTable('locks',{userId:text('user_id').primaryKey().references(()=>users.id,{onDelete:'cascade'}),requestId:text('request_id').notNull(),expiresAt:integer('expires_at').notNull()});
