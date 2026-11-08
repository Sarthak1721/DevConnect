-- Runs once, when the Postgres volume is first created (see docker-compose.yml).
-- Automated tests get their own database so a test run can never wipe your development data.
CREATE DATABASE devconnect_test;
