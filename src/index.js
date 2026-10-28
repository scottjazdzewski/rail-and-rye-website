
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        website: "Rail & Rye",
        status: "online",
        storage: env.CARDS_BUCKET
          ? "connected"
          : "not connected"
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    return env.ASSETS.fetch(request);
  }
};
