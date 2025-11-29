// src/components/settings/AccountShortcutSection.tsx
import { Link } from 'react-router-dom';

export default function AccountShortcutSection() {
  return (
    <section
      className="
        rounded-2xl border border-black/10 bg-white p-6 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.07)]
        dark:border-white/10 dark:bg-neutral-950 dark:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)]
      "
    >
      {/* header global */}
      <h2 className="text-2xl font-semibold leading-tight text-neutral-900 dark:text-neutral-100">
        Security
      </h2>
      <p className="mt-2 text-base text-neutral-600 dark:text-neutral-400">
        Shortcuts to security settings.
      </p>

      {/* grid des raccourcis */}
      <div
        className="
          mt-6 grid gap-4
          sm:grid-cols-1
          lg:grid-cols-3
        "
      >
        {/* Change password */}
        <div
          className="
            rounded-2xl border border-black/10 bg-white p-4
            dark:border-white/10 dark:bg-neutral-950
          "
        >
          <h3 className="text-2xl font-semibold leading-tight text-neutral-900 dark:text-neutral-100">
            Change password
          </h3>

          <p className="mt-3 text-lg text-neutral-700 dark:text-neutral-300">
            Update your current password.
          </p>

          <Link
            to="/settings#security"
            className="
              mt-4 inline-flex rounded-xl bg-neutral-900 px-4 py-2 text-base font-semibold
              text-white hover:bg-neutral-800
              dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200
            "
          >
            Go to security
          </Link>
        </div>

        {/* Change email */}
        <div
          className="
            rounded-2xl border border-black/10 bg-white p-4
            dark:border-white/10 dark:bg-neutral-950
          "
        >
          <h3 className="text-2xl font-semibold leading-tight text-neutral-900 dark:text-neutral-100">
            Change email
          </h3>

          <p className="mt-3 text-lg text-neutral-700 dark:text-neutral-300">
            Update your sign-in email.
          </p>

          <Link
            to="/settings#security"
            className="
              mt-4 inline-flex rounded-xl bg-neutral-900 px-4 py-2 text-base font-semibold
              text-white hover:bg-neutral-800
              dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200
            "
          >
            Change email
          </Link>
        </div>

        {/* Active sessions */}
        <div
          className="
            rounded-2xl border border-black/10 bg-white p-4
            dark:border-white/10 dark:bg-neutral-950
          "
        >
          <h3 className="text-2xl font-semibold leading-tight text-neutral-900 dark:text-neutral-100">
            Active sessions
          </h3>

          <p className="mt-3 text-lg text-neutral-700 dark:text-neutral-300">
            See connected devices.
          </p>

          <Link
            to="/settings#security"
            className="
              mt-4 inline-flex rounded-xl border border-black/15 bg-white px-4 py-2 text-base font-semibold
              text-neutral-900 hover:bg-black/[0.03]
              dark:border-white/20 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-white/10
            "
          >
            Go to sessions
          </Link>
        </div>
      </div>
    </section>
  );
}
