import prisma from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: { user_id: string } }
) {
  try {
    const { user_id } = params;
    const { info } = await request.json();
    await prisma.user.update({
      where: { id: user_id },
      data: { [info.field]: info.value },
    });
    return new Response(
      JSON.stringify({
        message: `User ${user_id} info updated`,
        updatedField: info.field,
        newValue: info.value,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating user info:", error);
    return new Response("Error updating user info", { status: 500 });
  }
}
