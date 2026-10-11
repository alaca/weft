// The mark of the app: three threads of colour with three of linen woven across them. It is the
// drawing of the app's icon without the tile under it.
export function Mark() {
    return (
        <svg class="mark" viewBox="222 300 580 424" aria-hidden="true">
            <g fill="none" stroke-linecap="round" stroke-width="56">
                <path d="M250 372h524" stroke="#e5583f" />
                <path d="M250 512h524" stroke="#ecb739" />
                <path d="M250 652h524" stroke="#79b4f2" />
            </g>
            <g fill="#ece6d6">
                <rect x="352" y="300" width="56" height="424" rx="28" />
                <rect x="484" y="300" width="56" height="424" rx="28" />
                <rect x="616" y="300" width="56" height="424" rx="28" />
            </g>
        </svg>
    )
}
