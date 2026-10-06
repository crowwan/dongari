import type { ComponentPropsWithRef } from 'react'
import './ui.css'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-text'

// 모양은 토큰으로만 정하므로 className·style 은 받지 않는다 (React 19: ref 도 일반 prop 으로 받는다)
type ButtonProps = Omit<ComponentPropsWithRef<'button'>, 'className' | 'style'> & {
  variant?: ButtonVariant
}

// 글자가 있는 기본 버튼. 주(채움) / 보조(테두리) / 위험(빨강 채움) / 위험 글자형(밑줄)
export function Button({ variant = 'primary', type = 'button', ...rest }: ButtonProps) {
  return <button {...rest} type={type} className="ui-button" data-variant={variant} data-testid="button" />
}
