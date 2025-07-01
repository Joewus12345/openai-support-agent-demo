// Functions mapping to tool calls
// Define one function per tool. Parameters for a tool call are passed as an object

export const schedule_service_visit = async ({
  equipment_id,
  preferred_date,
  issue_description,
}: {
  equipment_id: string;
  preferred_date: string;
  issue_description: string;
}) => {
  try {
    const res = await fetch(`/api/service_visits/schedule`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ equipment_id, preferred_date, issue_description }),
    }).then((res) => res.json());
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to schedule service visit" };
  }
};

export const request_product_manual = async ({ product_id }: { product_id: string }) => {
  try {
    const res = await fetch(`/api/product_manuals/${product_id}`).then((res) => res.json());
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to fetch product manual" };
  }
};

export const submit_warranty_claim = async ({
  product_id,
  purchase_date,
  issue,
}: {
  product_id: string;
  purchase_date: string;
  issue: string;
}) => {
  try {
    const res = await fetch(`/api/warranty_claims/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ product_id, purchase_date, issue }),
    }).then((res) => res.json());
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to submit warranty claim" };
  }
};

export const get_order = async ({ order_id }: { order_id: string }) => {
  try {
    const res = await fetch(`/api/orders/${order_id}`).then((res) => res.json());
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to retrieve order" };
  }
};

export const cancel_order = async ({ order_id }: { order_id: string }) => {
  try {
    const res = await fetch(`/api/orders/${order_id}/cancel`, {
      method: "POST",
    }).then((res) => res.json());
    return res;
  } catch (error) {
    console.error(error);
    return { error: "Failed to cancel order" };
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

export const create_complaint = async ({
  user_id,
  type,
  details,
  order_id,
}: {
  user_id: string;
  type: string;
  details: string;
  order_id?: string;
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

export const functionsMap = {
  schedule_service_visit,
  request_product_manual,
  submit_warranty_claim,
  get_order,
  cancel_order,
  create_return,
  create_refund,
  create_complaint,
};
