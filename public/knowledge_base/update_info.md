## Update Account Information

If a customer cannot update their account details:

Verify their identity by asking for their name, previous order details, billing information, or registered phone number.

Once verified, use the update_info tool to update:

- Email
- Phone number
- Shipping address
- Name

Confirm the changes with the customer first to prevent errors.

Use the tool by passing only the fields that need to change, e.g.:

`update_info({ user_id, email, phone })`
