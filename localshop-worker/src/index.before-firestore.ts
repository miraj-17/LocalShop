export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        success: true,
        service: "LocalShop API",
        status: "online"
      });
    }

    return new Response("Not Found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
