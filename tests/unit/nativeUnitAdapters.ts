import {
  createElement,
  useEffect,
  useImperativeHandle,
  forwardRef,
  type ReactNode,
} from "react";

type Props = {
  children?: ReactNode;
  accessibilityLabel?: string;
  onPress?: () => void;
  disabled?: boolean;
  value?: string;
  onChangeText?: (value: string) => void;
  onLayout?: (event: { nativeEvent: { layout: { y: number } } }) => void;
  style?: unknown;
};
export function View(props: Props) {
  useEffect(() => {
    props.onLayout?.({ nativeEvent: { layout: { y: 20 } } });
  }, [props.onLayout]);
  return createElement("div", {}, props.children);
}
export function Pressable(props: Props) {
  if (typeof props.style === "function") {
    props.style({ pressed: false });
    props.style({ pressed: true });
  }
  return createElement(
    "button",
    {
      onClick: props.onPress,
      disabled: props.disabled,
      "aria-label": props.accessibilityLabel,
    },
    props.children,
  );
}
export function TextInput(props: Props) {
  return createElement("input", {
    "aria-label": props.accessibilityLabel,
    value: props.value,
    onInput: (event: React.FormEvent<HTMLInputElement>) =>
      props.onChangeText?.(event.currentTarget.value),
  });
}
export const ScrollView = forwardRef<
  { scrollTo: (value: unknown) => void },
  Props
>((props, ref) => {
  useImperativeHandle(ref, () => ({ scrollTo: () => undefined }));
  return createElement(View, props);
});
export const Text = View;
export const Image = View;
export const ActivityIndicator = () => createElement("span", {}, "Loading");
export const SafeAreaView = View;
