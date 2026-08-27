import { intParam, route } from "@/api/handler";
import { dismissalReasons, listReviews, reviewerAgreement } from "@/reviews/service";

export const dynamic = "force-dynamic";

export const GET = route(async ({ db, url }) => {
  const reviews = await listReviews(db, {
    status: url.searchParams.get("status") ?? undefined,
    limit: intParam(url, "limit", 50, 200),
  });
  return {
    reviews,
    count: reviews.length,
    agreement: await reviewerAgreement(db),
    dismissalReasons: await dismissalReasons(db),
  };
});
