// The whole database schema. drizzle-kit reads this file to generate migrations,
// and the API imports tables from here: import { users, posts } from '../db/schema'.
export * from './auth';
export * from './follows';
export * from './github';
export * from './posts';
export * from './skills';
export * from './users';
