import { createSignal, Show } from 'solid-js'
import { backToSignIn, forgotPassword, makeAccount, resetPassword, signInToSite } from '../app/account'
import { NAME_LIMIT } from '../jam/protocol'
import { account, PASSWORD_LEAST } from '../site/api'
import { accountNote, forgotFor } from '../stores/account'
import { jamName } from '../stores/jam'

// Signing in to your account on the site, or making one: an email and a password. A
// forgotten password is replaced here too, with a code that is sent to the email.
export function AccountForm() {
    const [isNew, setIsNew] = createSignal(!account.get())
    const [name, setName] = createSignal(jamName())
    const [email, setEmail] = createSignal(account.get())
    const [password, setPassword] = createSignal('')
    const [code, setCode] = createSignal('')

    return (
        <div class="pb-acc" data-testid="account-form">
            <Show
                when={forgotFor()}
                fallback={
                    <>
                        <div class="seg" role="group" aria-label="Account">
                            <button classList={{ on: !isNew() }} aria-pressed={!isNew()} onClick={() => setIsNew(false)}>
                                Sign in
                            </button>
                            <button classList={{ on: isNew() }} aria-pressed={isNew()} onClick={() => setIsNew(true)}>
                                Make an account
                            </button>
                        </div>
                        <form
                            class="pb-acc"
                            onSubmit={(event) => {
                                event.preventDefault()
                                void (isNew() ? makeAccount(name(), email(), password()) : signInToSite(email(), password()))
                            }}
                        >
                            <Show when={isNew()}>
                                <label class="pb-f">
                                    <span class="xp-l">Name</span>
                                    <input placeholder="As it stands beside your songs" aria-label="Your name" autocomplete="nickname" value={name()} maxLength={NAME_LIMIT} onInput={(event) => setName(event.currentTarget.value)} />
                                </label>
                            </Show>
                            <label class="pb-f">
                                <span class="xp-l">Email</span>
                                <input type="email" placeholder="you@example.com" aria-label="Your email" autocomplete="email" value={email()} maxLength={254} onInput={(event) => setEmail(event.currentTarget.value)} />
                            </label>
                            <label class="pb-f">
                                <span class="xp-l">Password</span>
                                <input
                                    type="password"
                                    placeholder={isNew() ? `At least ${PASSWORD_LEAST} characters` : ''}
                                    aria-label="Your password"
                                    autocomplete={isNew() ? 'new-password' : 'current-password'}
                                    value={password()}
                                    maxLength={200}
                                    onInput={(event) => setPassword(event.currentTarget.value)}
                                />
                            </label>
                            <div class="xp-f">
                                <Show when={!isNew()}>
                                    <button type="button" class="pb-forgot" onClick={() => void forgotPassword(email())}>
                                        Forgot your password?
                                    </button>
                                </Show>
                                <span class="grow" />
                                <button class="btn go">{isNew() ? 'Make my account' : 'Sign in'}</button>
                            </div>
                        </form>
                    </>
                }
            >
                {(asked) => (
                    <form
                        class="pb-acc"
                        onSubmit={(event) => {
                            event.preventDefault()
                            void resetPassword(code(), password())
                        }}
                    >
                        <Show when={asked().code}>
                            {(shown) => (
                                <p class="pb-dev" data-testid="account-code">
                                    No mail is sent from this machine. The code is <b>{shown()}</b>
                                </p>
                            )}
                        </Show>
                        <label class="pb-f">
                            <span class="xp-l">Code</span>
                            <input aria-label="The code that was sent to you" autocomplete="one-time-code" value={code()} maxLength={12} onInput={(event) => setCode(event.currentTarget.value)} />
                        </label>
                        <label class="pb-f">
                            <span class="xp-l">Password</span>
                            <input type="password" placeholder={`A new one, at least ${PASSWORD_LEAST} characters`} aria-label="Your new password" autocomplete="new-password" value={password()} maxLength={200} onInput={(event) => setPassword(event.currentTarget.value)} />
                        </label>
                        <div class="xp-f">
                            <button type="button" class="pb-forgot" onClick={backToSignIn}>
                                Back to signing in
                            </button>
                            <span class="grow" />
                            <button class="btn go">Set the new password</button>
                        </div>
                    </form>
                )}
            </Show>
            <p class="xp-n" role="status" data-testid="account-note">
                {accountNote()}
            </p>
        </div>
    )
}
