export type Person = {
	id: number;
	firstName: string;
	lastName: string;
	age: number;
	visits: number;
	progress: number;
	status: "relationship" | "complicated" | "single";
	subRows?: Person[];
};

const hardcodedData: Person[] = [
	{
		id: 1,
		firstName: "John",
		lastName: "Doe",
		age: 30,
		visits: 100,
		progress: 50,
		status: "single",
	},
	{
		id: 2,
		firstName: "Jane",
		lastName: "Smith",
		age: 25,
		visits: 45,
		progress: 80,
		status: "relationship",
	},
	{
		id: 3,
		firstName: "Alice",
		lastName: "Johnson",
		age: 35,
		visits: 120,
		progress: 30,
		status: "complicated",
	},
];

export function makeData() {
	return hardcodedData;
}
