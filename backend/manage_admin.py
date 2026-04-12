#!/usr/bin/env python3
"""
CLI Tool to manage Administrator and User Accounts for Amazon Review Synthesizer.

Usage:
  # List all accounts:
  python manage_admin.py list

  # Create a new administrator:
  python manage_admin.py create --email admin2@example.com --password mypassword --name "Second Admin"

  # Promote an existing user to administrator:
  python manage_admin.py promote --email user@example.com

  # Demote an administrator to regular user:
  python manage_admin.py demote --email admin2@example.com

  # Update an administrator's or user's password or name:
  python manage_admin.py update --email admin@synthesizer.local --password newpassword123 --name "Updated Admin"
"""

import sys
import os
import argparse

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.database import get_connection, hash_password, init_db

def list_users():
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, email, name, is_admin, created_at, last_login
            FROM users
            ORDER BY id ASC;
        """)
        users = cursor.fetchall()

    if not users:
        print("No accounts found in the database.")
        return

    print("\n" + "=" * 75)
    print(f"{'ID':<4} {'Role':<8} {'Email':<30} {'Name':<20} {'Created'}")
    print("=" * 75)
    for u in users:
        role = "ADMIN 👑" if u["is_admin"] else "USER"
        created = (u["created_at"] or "")[:10]
        print(f"{u['id']:<4} {role:<8} {u['email']:<30} {u['name']:<20} {created}")
    print("=" * 75 + "\n")

def create_admin(email: str, password: str, name: str):
    init_db()
    email_clean = email.strip().lower()
    if not email_clean or not password:
        print("Error: Email and password are required.")
        sys.exit(1)

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = ?;", (email_clean,))
        if cursor.fetchone():
            print(f"Error: An account with email '{email_clean}' already exists.")
            sys.exit(1)

        pwd_hash, salt = hash_password(password)
        cursor.execute("""
            INSERT INTO users (email, name, password_hash, salt, is_admin)
            VALUES (?, ?, ?, ?, 1);
        """, (email_clean, name.strip() or "Administrator", pwd_hash, salt))
        conn.commit()

    print(f"✅ Successfully created new Administrator account: {email_clean}")

def promote_user(email: str):
    init_db()
    email_clean = email.strip().lower()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, is_admin FROM users WHERE email = ?;", (email_clean,))
        user = cursor.fetchone()
        if not user:
            print(f"Error: User '{email_clean}' not found.")
            sys.exit(1)

        if user["is_admin"]:
            print(f"User '{email_clean}' is already an administrator.")
            return

        cursor.execute("UPDATE users SET is_admin = 1 WHERE id = ?;", (user["id"],))
        conn.commit()

    print(f"✅ User '{email_clean}' ({user['name']}) has been promoted to Administrator 👑.")

def demote_user(email: str):
    init_db()
    email_clean = email.strip().lower()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, is_admin FROM users WHERE email = ?;", (email_clean,))
        user = cursor.fetchone()
        if not user:
            print(f"Error: User '{email_clean}' not found.")
            sys.exit(1)

        # Ensure we do not demote the only admin
        cursor.execute("SELECT COUNT(*) as cnt FROM users WHERE is_admin = 1;")
        admin_count = cursor.fetchone()["cnt"]
        if admin_count <= 1 and user["is_admin"]:
            print("Error: Cannot demote the last remaining administrator account.")
            sys.exit(1)

        cursor.execute("UPDATE users SET is_admin = 0 WHERE id = ?;", (user["id"],))
        conn.commit()

    print(f"✅ Account '{email_clean}' ({user['name']}) has been demoted to regular User.")

def update_account(email: str, password: str = None, name: str = None, is_admin: bool = None):
    init_db()
    email_clean = email.strip().lower()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, is_admin FROM users WHERE email = ?;", (email_clean,))
        user = cursor.fetchone()
        if not user:
            print(f"Error: User '{email_clean}' not found.")
            sys.exit(1)

        updates = []
        params = []
        if name is not None and name.strip():
            updates.append("name = ?")
            params.append(name.strip())

        if password is not None and password.strip():
            pwd_hash, salt = hash_password(password.strip())
            updates.append("password_hash = ?, salt = ?")
            params.extend([pwd_hash, salt])

        if is_admin is not None:
            updates.append("is_admin = ?")
            params.append(1 if is_admin else 0)

        if not updates:
            print("No fields specified for update.")
            return

        params.append(user["id"])
        query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?;"
        cursor.execute(query, tuple(params))
        conn.commit()

    print(f"✅ Successfully updated account for '{email_clean}'.")

def main():
    parser = argparse.ArgumentParser(description="Manage Admin and User Accounts for Amazon Review Synthesizer")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # list
    subparsers.add_parser("list", help="List all registered accounts")

    # create
    create_p = subparsers.add_parser("create", help="Create a new administrator account")
    create_p.add_argument("--email", required=True, help="Email address for the admin")
    create_p.add_argument("--password", required=True, help="Password for the admin")
    create_p.add_argument("--name", default="Administrator", help="Full name for the admin")

    # promote
    promote_p = subparsers.add_parser("promote", help="Promote an existing account to administrator")
    promote_p.add_argument("--email", required=True, help="Email of the account to promote")

    # demote
    demote_p = subparsers.add_parser("demote", help="Demote an administrator account to regular user")
    demote_p.add_argument("--email", required=True, help="Email of the account to demote")

    # update
    update_p = subparsers.add_parser("update", help="Update name, password, or role of an account")
    update_p.add_argument("--email", required=True, help="Email of the account to update")
    update_p.add_argument("--password", help="New password for the account")
    update_p.add_argument("--name", help="New name for the account")
    update_p.add_argument("--admin", dest="is_admin", type=lambda x: (str(x).lower() in ['true', '1', 'yes']), help="Set admin status (true/false)")

    args = parser.parse_args()

    if args.command == "list":
        list_users()
    elif args.command == "create":
        create_admin(args.email, args.password, args.name)
    elif args.command == "promote":
        promote_user(args.email)
    elif args.command == "demote":
        demote_user(args.email)
    elif args.command == "update":
        update_account(args.email, args.password, args.name, args.is_admin)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
