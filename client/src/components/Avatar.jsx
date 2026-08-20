import { useState } from "react";
import { cx } from "./ui.jsx";

const initialOf = (name) => (name?.trim()?.[0] || "?").toUpperCase();

// A single circular avatar: the user's image, or their initial on a tinted disc
// when there's no avatar or the image fails to load. Size/ring come from
// `className` so callers control the look.
export function Avatar({ user, className, title }) {
    const [broken, setBroken] = useState(false);
    const name = user?.name || "";
    const label = title ?? name;

    if (user?.avatar && !broken) {
        return (
            <img
                src={user.avatar}
                alt={name}
                title={label}
                onError={() => setBroken(true)}
                className={cx("shrink-0 rounded-full object-cover", className)}
            />
        );
    }
    return (
        <span
            title={label}
            className={cx(
                "flex shrink-0 items-center justify-center rounded-full bg-brand-600 font-semibold text-white",
                className,
            )}
        >
            {initialOf(name)}
        </span>
    );
}

// A row of overlapping "read by" heads. Shows up to `max` avatars, then a "+N"
// disc for the rest. Each head is ringed so overlaps read clearly.
export function AvatarStack({ users = [], max = 4, size = "h-6 w-6", className }) {
    if (!users.length) return null;
    const shown = users.slice(0, max);
    const extra = users.length - shown.length;

    return (
        <span className={cx("flex items-center -space-x-1.5", className)}>
            {shown.map((u, i) => (
                <Avatar
                    key={u._id || u.name || i}
                    user={u}
                    className={cx(size, "text-[10px] ring-2 ring-white")}
                />
            ))}
            {extra > 0 && (
                <span
                    title={`+${extra} more`}
                    className={cx(
                        size,
                        "flex shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-600 ring-2 ring-white",
                    )}
                >
                    +{extra}
                </span>
            )}
        </span>
    );
}
