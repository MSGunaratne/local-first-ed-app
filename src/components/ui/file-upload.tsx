import { CloudUpload, FileIcon, X } from "lucide-react";
import * as React from "react";
import { type DropzoneOptions, useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { Button } from "./button";

interface FileUploaderProps extends React.HTMLAttributes<HTMLDivElement> {
	value?: File[] | null;
	onValueChange?: (files: File[]) => void;
	dropzoneOptions?: DropzoneOptions;
	description?: string;
}

export function FileUploader({
	value = [],
	onValueChange,
	dropzoneOptions,
	description,
	className,
	...props
}: FileUploaderProps) {
	const onDrop = React.useCallback(
		(acceptedFiles: File[], rejectedFiles: unknown[]) => {
			if (!onValueChange) return;

			const currentFiles = value || [];
			if (
				dropzoneOptions?.multiple ||
				dropzoneOptions?.multiple === undefined
			) {
				onValueChange([...currentFiles, ...acceptedFiles]);
			} else {
				onValueChange(acceptedFiles);
			}

			if (rejectedFiles.length > 0) {
				toast.error(m.common_file_upload_rejected());
			}
		},
		[value, onValueChange, dropzoneOptions],
	);

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop,
		accept: dropzoneOptions?.accept,
		maxSize: dropzoneOptions?.maxSize,
		maxFiles: dropzoneOptions?.maxFiles,
		multiple: dropzoneOptions?.multiple,
		...dropzoneOptions,
	});

	const removeFile = (fileToRemove: File) => {
		if (!onValueChange || !value) return;
		onValueChange(value.filter((file) => file !== fileToRemove));
	};

	return (
		<div className={cn("grid gap-4", className)} {...props}>
			<div
				{...getRootProps()}
				className={cn(
					"border-2 border-dashed rounded-lg p-10 hover:bg-muted/50 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 text-center",
					isDragActive
						? "border-primary bg-muted/50"
						: "border-muted-foreground/25",
				)}
			>
				<input {...getInputProps()} />
				<div className="p-4 bg-background rounded-full border shadow-sm">
					<CloudUpload className="h-8 w-8 text-muted-foreground" />
				</div>
				<div className="space-y-1">
					<p className="font-medium text-sm">
						{isDragActive
							? m.common_file_upload_drop_active()
							: m.common_file_upload_drop_idle()}
					</p>
					{description && (
						<p className="text-xs text-muted-foreground">{description}</p>
					)}
				</div>
			</div>

			{value && value.length > 0 && (
				<div className="h-fit max-h-[200px] w-full rounded-md border overflow-y-auto">
					<div className="p-4 space-y-4">
						{value.map((file, index) => (
							<div
								key={`${file.name}-${file.size}-${index}`}
								className="flex items-center justify-between gap-4 p-2 rounded-lg border bg-card"
							>
								<div className="flex items-center gap-3 overflow-hidden">
									{file.type.startsWith("image/") ? (
										<img
											src={URL.createObjectURL(file)}
											alt={file.name}
											className="h-10 w-10 rounded-md object-cover border"
										/>
									) : (
										<div className="h-10 w-10 flex items-center justify-center rounded-md bg-muted border">
											<FileIcon className="h-5 w-5 text-muted-foreground" />
										</div>
									)}
									<div className="truncate">
										<p className="text-sm font-medium truncate max-w-[200px]">
											{file.name}
										</p>
										<p className="text-xs text-muted-foreground">
											{(file.size / 1024).toFixed(2)} KB
										</p>
									</div>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="text-muted-foreground hover:text-foreground"
									onClick={() => removeFile(file)}
								>
									<X className="h-4 w-4" />
									<span className="sr-only">
										{m.common_file_upload_remove()}
									</span>
								</Button>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
