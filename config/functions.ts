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

export const functionsMap = {
  schedule_service_visit,
  request_product_manual,
  submit_warranty_claim,
};
