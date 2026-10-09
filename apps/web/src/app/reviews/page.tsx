import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ReviewForm } from '@/components/reviews/ReviewForm';
import { Stars } from '@/components/reviews/Stars';
import { serverApiSafe } from '@/lib/server-api';
import { getSessionUser } from '@/lib/session';
import type { MyReviews } from '@/lib/review-types';

export const dynamic = 'force-dynamic';

export default async function MyReviewsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/reviews');
  if (user.role !== 'CUSTOMER') redirect('/account?denied=/reviews');

  const data = await serverApiSafe<MyReviews>('/reviews/mine');
  const awaiting = data?.awaiting ?? [];
  const written = data?.written ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">Reviews</h1>
      <p className="mt-1 text-sm text-zinc-500">
        You can review a shop once it has delivered your order.
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
          Waiting for your review
        </h2>
        {awaiting.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            Nothing to review right now.{' '}
            <Link href="/orders" className="underline">
              See your orders
            </Link>
          </p>
        ) : (
          <div className="space-y-4">
            {awaiting.map((order) => (
              <ReviewForm key={order.id} order={order} />
            ))}
          </div>
        )}
      </section>

      {written.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
            Already reviewed
          </h2>
          <ul className="space-y-3">
            {written.map((review) => (
              <li
                key={review.id}
                className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/shops/${review.vendor.slug}`}
                    className="font-medium hover:underline"
                  >
                    🏪 {review.vendor.name}
                  </Link>
                  <Stars value={review.rating} />
                </div>
                {review.product && (
                  <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                    on {review.product.title}
                  </p>
                )}
                {review.comment && (
                  <p className="mt-1 text-zinc-600 dark:text-zinc-300">{review.comment}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
