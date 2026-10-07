export default function PaymentCallbackPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-6 py-12 text-center text-slate-100">
      <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-3xl">
          ✅
        </div>
        <h1 className="text-xl font-semibold">Thanks! We're confirming your payment</h1>
        <p className="mt-3 text-sm text-slate-400">
          You can close this window and go back to Telegram. Your subscription will activate automatically within a
          few seconds, or tap &ldquo;I&apos;ve Paid - Check Status&rdquo; on the message from the bot.
        </p>
      </div>
    </main>
  );
}
