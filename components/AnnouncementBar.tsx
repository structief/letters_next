import Link from "next/link";

export default function AnnouncementBar() {
  return (
    <div className="announcement-bar">
      <p className="announcement-text">
        Join us in testing the new app -&gt; <Link href="/register" className="announcement-link">Register now</Link>!
      </p>
    </div>
  )
}
