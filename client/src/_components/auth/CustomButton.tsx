import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextStyle, TouchableOpacity, ViewStyle } from 'react-native';

interface CustomButtonProps {
	title: string;
	onPress: () => void;
	variant?: 'primary' | 'secondary' | 'outline';
	loading?: boolean;
	disabled?: boolean;
	style?: ViewStyle;
	textStyle?: TextStyle;
}

export default function CustomButton({
	title,
	onPress,
	variant = 'primary',
	loading = false,
	disabled = false,
	style,
	textStyle,
}: CustomButtonProps) {
	const getButtonStyle = () => {
		switch (variant) {
			case 'primary':
				return styles.primaryButton;
			case 'secondary':
				return styles.secondaryButton;
			case 'outline':
				return styles.outlineButton;
			default:
				return styles.primaryButton;
		}
	};

	const getTextStyle = () => {
		switch (variant) {
			case 'primary':
				return styles.primaryText;
			case 'secondary':
				return styles.secondaryText;
			case 'outline':
				return styles.outlineText;
			default:
				return styles.primaryText;
		}
	};

	return (
		<TouchableOpacity
			style={[
				styles.button,
				getButtonStyle(),
				(disabled || loading) && styles.disabled,
				style,
			]}
			onPress={onPress}
			disabled={disabled || loading}
			activeOpacity={0.8}
		>
			{loading ? (
				<ActivityIndicator color={variant === 'primary' ? '#fff' : '#000'} />
			) : (
				<Text style={[getTextStyle(), textStyle]}>{title}</Text>
			)}
		</TouchableOpacity>
	);
}

const styles = StyleSheet.create({
	button: {
		height: 50,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 20,
	},
	primaryButton: {
		backgroundColor: '#0A3D62',
	},
	secondaryButton: {
		backgroundColor: '#000',
	},
	outlineButton: {
		backgroundColor: 'transparent',
		borderWidth: 1,
		borderColor: '#e0e0e0',
	},
	primaryText: {
		color: '#fff',
		fontSize: 16,
		fontWeight: '600',
	},
	secondaryText: {
		color: '#fff',
		fontSize: 16,
		fontWeight: '600',
	},
	outlineText: {
		color: '#000',
		fontSize: 16,
		fontWeight: '600',
	},
	disabled: {
		opacity: 0.6,
	},
});
