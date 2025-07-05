// Functions mapping to tool calls
// Define one function per tool call - each tool call should have a matching function
// Parameters for a tool call are passed as an object to the corresponding function
import useDataStore from "@/stores/useDataStore";

const setDetailsFromUser = (user: any) => ({
  id: user.id,
  name: user.name ?? "",
  email: user.email ?? "",
  phone: user.phone ?? "",
  address: user.address ?? "",
  signupDate: user.createdAt
    ? new Date(user.createdAt).toISOString().split("T")[0]
    : "",
  orderNb: user.orders ? user.orders.length : 0,
});

export const get_order = async ({ order_id }: { order_id: string }) => {
  try {
    const res = await fetch(`/api/orders/${order_id}`).then((res) =>
      res.json()
    );
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to get order" };
  }
};

export const get_order_history = async ({ user_id }: { user_id: string }) => {
  try {
    const res = await fetch(`/api/users/${user_id}/order_history`).then((res) =>
      res.json()
    );
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to get order history" };
  }
};

export const cancel_order = async ({ order_id }: { order_id: string }) => {
  try {
    const res = await fetch(`/api/orders/${order_id}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    }).then((res) => res.json());
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to cancel order" };
  }
};

export const reset_password = async ({ user_id }: { user_id: string }) => {
  try {
    const res = await fetch(`/api/users/${user_id}/reset_password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }).then((res) => res.json());
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to reset password" };
  }
};

export const send_replacement = async ({
  product_id,
  order_id,
}: {
  product_id: string;
  order_id: string;
}) => {
  try {
    const res = await fetch(`/api/orders/${order_id}/send_replacement`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ product_id }),
    }).then((res) => res.json());
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to send replacement" };
  }
};

export const create_refund = async ({
  order_id,
  amount,
  reason,
}: {
  order_id: string;
  amount: number;
  reason: string;
}) => {
  try {
    const res = await fetch(`/api/orders/${order_id}/create_refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount, reason }),
    }).then((res) => res.json());
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to create refund" };
  }
};

export const issue_voucher = async ({
  user_id,
  amount,
  reason,
}: {
  user_id: string;
  reason: string;
  amount: number;
}) => {
  try {
    const res = await fetch(`/api/vouchers/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id, reason, amount }),
    }).then((res) => res.json());
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to issue voucher" };
  }
};

export const create_return = async ({
  order_id,
  product_ids,
}: {
  order_id: string;
  product_ids: string[];
}) => {
  try {
    const res = await fetch(`/api/orders/${order_id}/create_return`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ product_ids }),
    }).then((res) => res.json());
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to create return" };
  }
};

export const create_complaint = async ({
  user_id,
  type,
  details,
  order_id,
}: {
  user_id: string;
  type: string;
  details: string;
  order_id: string;
}) => {
  try {
    const res = await fetch(`/api/complaints/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id, type, details, order_id }),
    }).then((res) => res.json());
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to create complaint" };
  }
};

export const create_ticket = async ({
  user_id,
  type,
  details,
  order_id,
}: {
  user_id: string;
  type: string;
  details: string;
  order_id: string;
}) => {
  try {
    const res = await fetch(`/api/tickets/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id, type, details, order_id }),
    }).then((res) => res.json());
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to create ticket" };
  }
};

export const update_info = async ({
  user_id,
  info,
}: {
  user_id: string;
  info: { field: string; value: string };
}) => {
  try {
    const res = await fetch(`/api/users/${user_id}/update_info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ info }),
    }).then((res) => res.json());
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to update info" };
  }
};

export const get_products = async ({ query }: { query: string }) => {
  try {
    const res = await fetch(
      `/api/products/search?query=${encodeURIComponent(query)}`
    ).then((res) => res.json());
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to search products" };
  }
};

export const get_about_us = async ({ query = "" }: { query?: string }) => {
  try {
    const url = query
      ? `/api/company/about?query=${encodeURIComponent(query)}`
      : "/api/company/about";
    const res = await fetch(url).then((res) => res.json());
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to get about us" };
  }
};

export const get_user_profile = async ({ email }: { email: string }) => {
  try {
    const user = await fetch(`/api/users?email=${encodeURIComponent(email)}`).then(
      (res) => res.json()
    );
    if (!user.error) {
      useDataStore.getState().setCustomerDetails(setDetailsFromUser(user));
    }
    return user;
  } catch (error) {
    console.error(error);
    return { error: "Failed to get user profile" };
  }
};

export const create_user_profile = async ({
  email,
  name,
  phone,
  address,
}: {
  email: string;
  name?: string;
  phone?: string;
  address?: string;
}) => {
  try {
    const user = await fetch(`/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, name, phone, address }),
    }).then((res) => res.json());
    if (!user.error) {
      useDataStore.getState().setCustomerDetails(setDetailsFromUser(user));
    }
    return user;
  } catch (error) {
    console.error(error);
    return { error: "Failed to create user profile" };
  }
};

export const start_chat_session = async ({
  email,
  name,
  phone,
  address,
}: {
  email: string;
  name?: string;
  phone?: string;
  address?: string;
}) => {
  try {
    const res = await fetch(`/api/sessions/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, phone, address }),
    }).then((res) => res.json());
    if (res.user && !res.user.error) {
      useDataStore.getState().setCustomerDetails(setDetailsFromUser(res.user));
    }
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to start chat session" };
  }
};

export const functionsMap = {
  get_order: get_order,
  get_order_history: get_order_history,
  cancel_order: cancel_order,
  reset_password: reset_password,
  send_replacement: send_replacement,
  create_refund: create_refund,
  issue_voucher: issue_voucher,
  create_return: create_return,
  create_complaint: create_complaint,
  update_info: update_info,
  create_ticket: create_ticket,
  get_user_profile: get_user_profile,
  create_user_profile: create_user_profile,
  start_chat_session: start_chat_session,
  get_products: get_products,
  get_about_us: get_about_us,
  // add more functions as needed
};
