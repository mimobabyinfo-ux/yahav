/*
  # Set Super Admin
  Run this after the user mimobaby.info@gmail.com has signed up.
  It grants them admin role.
*/
UPDATE user_profiles
SET is_admin = true
WHERE email = 'mimobaby.info@gmail.com';
