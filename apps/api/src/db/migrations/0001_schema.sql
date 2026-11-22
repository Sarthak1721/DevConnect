CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"family_expires_at" timestamp (3) with time zone NOT NULL,
	"rotated_at" timestamp (3) with time zone,
	"revoked_at" timestamp (3) with time zone,
	"replaced_by" uuid,
	"user_agent" text,
	CONSTRAINT "refresh_tokens_token_hash_format" CHECK ("refresh_tokens"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "refresh_tokens_expiry_valid" CHECK ("refresh_tokens"."expires_at" > "refresh_tokens"."created_at" and "refresh_tokens"."expires_at" <= "refresh_tokens"."family_expires_at"),
	CONSTRAINT "refresh_tokens_user_agent_length" CHECK (char_length("refresh_tokens"."user_agent") <= 512)
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" uuid NOT NULL,
	"followee_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_pkey" PRIMARY KEY("follower_id","followee_id"),
	CONSTRAINT "follows_not_self" CHECK ("follows"."follower_id" <> "follows"."followee_id")
);
--> statement-breakpoint
CREATE TABLE "github_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"github_user_id" bigint NOT NULL,
	"login" text NOT NULL,
	"avatar_url" text,
	"repos_etag" text,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp (3) with time zone,
	"last_sync_error" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_accounts_login_length" CHECK (char_length("github_accounts"."login") between 1 and 39),
	CONSTRAINT "github_accounts_sync_status_valid" CHECK ("github_accounts"."sync_status" in ('pending', 'ok', 'error')),
	CONSTRAINT "github_accounts_avatar_url_https" CHECK ("github_accounts"."avatar_url" ~ '^https://'),
	CONSTRAINT "github_accounts_last_sync_error_length" CHECK (char_length("github_accounts"."last_sync_error") <= 500)
);
--> statement-breakpoint
CREATE TABLE "github_repositories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"github_repo_id" bigint NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"html_url" text NOT NULL,
	"language" text,
	"stargazers_count" integer DEFAULT 0 NOT NULL,
	"forks_count" integer DEFAULT 0 NOT NULL,
	"is_fork" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"pushed_at" timestamp (3) with time zone,
	CONSTRAINT "github_repositories_html_url_github" CHECK ("github_repositories"."html_url" like 'https://github.com/%'),
	CONSTRAINT "github_repositories_counts_non_negative" CHECK ("github_repositories"."stargazers_count" >= 0 and "github_repositories"."forks_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"parent_id" uuid,
	"content" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_id_post_key" UNIQUE("id","post_id"),
	CONSTRAINT "comments_content_valid" CHECK (char_length("comments"."content") between 1 and 1000 and "comments"."content" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"user_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_likes_pkey" PRIMARY KEY("user_id","post_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"image_url" text,
	"image_public_id" text,
	"like_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', content)) STORED NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp (3) with time zone,
	CONSTRAINT "posts_content_valid" CHECK (char_length("posts"."content") between 1 and 3000 and "posts"."content" ~ '[^[:space:]]'),
	CONSTRAINT "posts_image_url_https" CHECK ("posts"."image_url" ~ '^https://'),
	CONSTRAINT "posts_image_fields_together" CHECK (("posts"."image_url" is null) = ("posts"."image_public_id" is null)),
	CONSTRAINT "posts_counts_non_negative" CHECK ("posts"."like_count" >= 0 and "posts"."comment_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_name_length" CHECK (char_length("skills"."name") between 1 and 40),
	CONSTRAINT "skills_slug_format" CHECK (char_length("skills"."slug") <= 40 and "skills"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "user_skills" (
	"user_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "user_skills_pkey" PRIMARY KEY("user_id","skill_id"),
	CONSTRAINT "user_skills_position_range" CHECK ("user_skills"."position" between 0 and 19)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"headline" text,
	"bio" text,
	"location" text,
	"portfolio_url" text,
	"social_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"experience" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"education" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_headline_length" CHECK (char_length("profiles"."headline") <= 120),
	CONSTRAINT "profiles_bio_length" CHECK (char_length("profiles"."bio") <= 2000),
	CONSTRAINT "profiles_location_length" CHECK (char_length("profiles"."location") <= 100),
	CONSTRAINT "profiles_portfolio_url_valid" CHECK (char_length("profiles"."portfolio_url") <= 2048 and "profiles"."portfolio_url" ~ '^https?://'),
	CONSTRAINT "profiles_social_links_is_object" CHECK (jsonb_typeof("profiles"."social_links") = 'object'),
	CONSTRAINT "profiles_experience_max_20" CHECK (case when jsonb_typeof("profiles"."experience") = 'array' then jsonb_array_length("profiles"."experience") <= 20 else false end),
	CONSTRAINT "profiles_education_max_20" CHECK (case when jsonb_typeof("profiles"."education") = 'array' then jsonb_array_length("profiles"."education") <= 20 else false end)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"avatar_url" text,
	"avatar_public_id" text,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"following_count" integer DEFAULT 0 NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_valid" CHECK (char_length("users"."email") <= 254 and "users"."email" = lower("users"."email") and "users"."email" ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
	CONSTRAINT "users_username_format" CHECK (char_length("users"."username") between 3 and 30 and "users"."username" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "users_name_valid" CHECK (char_length("users"."name") between 1 and 50 and "users"."name" !~ '^[[:space:]]|[[:space:]]$'),
	CONSTRAINT "users_avatar_url_https" CHECK ("users"."avatar_url" ~ '^https://'),
	CONSTRAINT "users_avatar_fields_together" CHECK (("users"."avatar_url" is null) = ("users"."avatar_public_id" is null)),
	CONSTRAINT "users_counts_non_negative" CHECK ("users"."follower_count" >= 0 and "users"."following_count" >= 0 and "users"."post_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_users_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_accounts" ADD CONSTRAINT "github_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_user_id_github_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."github_accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_same_post_fk" FOREIGN KEY ("parent_id","post_id") REFERENCES "public"."comments"("id","post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "follows_followee_created_idx" ON "follows" USING btree ("followee_id","created_at" DESC NULLS FIRST,"follower_id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "follows_follower_created_idx" ON "follows" USING btree ("follower_id","created_at" DESC NULLS FIRST,"followee_id" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "github_accounts_github_user_id_key" ON "github_accounts" USING btree ("github_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_repositories_user_repo_key" ON "github_repositories" USING btree ("user_id","github_repo_id");--> statement-breakpoint
CREATE INDEX "comments_post_created_idx" ON "comments" USING btree ("post_id","created_at","id");--> statement-breakpoint
CREATE INDEX "comments_parent_created_idx" ON "comments" USING btree ("parent_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_author_idx" ON "comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "post_likes_post_created_idx" ON "post_likes" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_author_created_idx" ON "posts" USING btree ("author_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "posts_created_idx" ON "posts" USING btree ("created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "posts_search_vector_idx" ON "posts" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_slug_key" ON "skills" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "skills_name_trgm_idx" ON "skills" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "user_skills_user_position_key" ON "user_skills" USING btree ("user_id","position");--> statement-breakpoint
CREATE INDEX "user_skills_skill_idx" ON "user_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_username_trgm_idx" ON "users" USING gin ("username" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_name_trgm_idx" ON "users" USING gin ("name" gin_trgm_ops);